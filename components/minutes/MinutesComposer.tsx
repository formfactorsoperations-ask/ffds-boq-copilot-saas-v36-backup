import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock, MapPin, Users, RotateCcw, ListChecks, Sparkles, FileText, ShieldCheck, Plus, Trash2, CornerDownLeft,
  Eye, Send, Check, CircleDot, Mic, MessageSquare, CalendarClock, Loader2, Pencil,
} from '@/lib/lucide-shim';
import {
  allLines, checksOf, readyToSend, emptyTopic, newLine, guessKind, needsOwner, quickDues, dueFromKey, keyOfDue, fmtShortDay,
  KIND_LABEL, type CarriedAction, type LineKind, type MinutesContent, type MinutesLine, type MinutesTopic, type OwnerSide, type ReviewNote,
  type CorrectionLine,
} from '../../lib/minutes';
import { meetingTypeLabel } from '../../lib/meetingTypes';
import {
  Panel, Seg, KindChip, FromNotes, Avatar, CheckRow, Chip, EYEBROW, input, btnPri, btnSec, btnSm, linkBtn,
} from './MinutesBits';

/*
  WRITING THE MINUTES (mockup 2).

  One screen instead of the three capture forms. It opens from the meeting that
  happened, so who and when are already there; last meeting's open actions
  come first; each topic holds short lines, every one a decision, an action, a
  note or an open question. An action needs a real person and a date. Points
  from pasted notes or speech are marked "from notes · check" until a person
  opens them. "Before you send" runs as you write.
*/

export interface PersonOption { name: string; side: OwnerSide; email?: string | null; role?: string | null }

const KINDS: LineKind[] = ['decision', 'action', 'note', 'question'];
const SIDE_LABEL: Record<string, string> = { client: 'Client', ffds: 'Studio', vendor: 'Vendor' };

export interface ComposerProps {
  key?: React.Key;
  initial: MinutesContent;
  meeting: { title: string; type: string; date: number; end?: number | null; venue?: string | null };
  people: PersonOption[];
  /** The Ops Director's notes from a return, on the lines they are about. */
  reviewNotes?: ReviewNote[];
  /** What the client marked wrong, when this is a revision. */
  corrections?: CorrectionLine[];
  revision?: { number: number } | null;
  /** Notes taken on the meeting before the minutes were started. */
  initialNotes?: string;
  readOnly?: boolean;
  readOnlyNote?: React.ReactNode;
  /** Saves as you type; resolves when stored. */
  onSave: (c: MinutesContent) => Promise<void>;
  onNotesToPoints: (notes: string) => Promise<{ topics: MinutesTopic[]; summary: string }>;
  onWriteBrief: (c: MinutesContent) => Promise<string>;
  onPreview: (c: MinutesContent) => void;
  /** The main button, from the screen around this one (Send for approval / Approve & send). */
  primary: (c: MinutesContent, ready: boolean) => React.ReactNode;
}

export default function MinutesComposer(p: ComposerProps) {
  const [c, setC] = useState<MinutesContent>(() => ({ ...p.initial, topics: p.initial.topics?.length ? p.initial.topics : [emptyTopic('')] }));
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const first = useRef(true);
  const latest = useRef(c);
  latest.current = c;

  /* Saves a moment after the last keystroke. */
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (p.readOnly) return;
    setSaved('saving');
    const t = setTimeout(() => {
      p.onSave(latest.current).then(() => setSaved('saved')).catch(() => setSaved('error'));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  const checks = useMemo(() => checksOf({ ...c, topics: c.topics }), [c]);
  const ready = readyToSend(checks);
  const ro = !!p.readOnly;

  const setTopic = (id: string, patch: Partial<MinutesTopic>) => setC((x) => ({ ...x, topics: x.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setLine = (tid: string, lid: string, patch: Partial<MinutesLine>) => setC((x) => ({
    ...x, topics: x.topics.map((t) => (t.id !== tid ? t : { ...t, lines: t.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) })),
  }));
  const removeLine = (tid: string, lid: string) => setC((x) => ({ ...x, topics: x.topics.map((t) => (t.id !== tid ? t : { ...t, lines: t.lines.filter((l) => l.id !== lid) })) }));
  const addLine = (tid: string, text: string) => {
    const kind = guessKind(text);
    setC((x) => ({ ...x, topics: x.topics.map((t) => (t.id !== tid ? t : { ...t, lines: [...t.lines, newLine(kind, text.trim())] })) }));
  };
  const removeTopic = (tid: string) => setC((x) => ({ ...x, topics: x.topics.filter((t) => t.id !== tid) }));
  const setCarried = (i: number, outcome: CarriedAction['outcome']) => setC((x) => ({ ...x, carried: (x.carried || []).map((k, j) => (j === i ? { ...k, outcome } : k)) }));

  /* Scroll to the next line a check is about, inside the minutes, and light it up for a moment. */
  const showNext = (need: 'notes' | 'owner' | 'due') => {
    const el = document.querySelector<HTMLElement>(`[data-needs~="${need}"]`);
    const box = el?.closest<HTMLElement>('.overflow-y-auto');
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    box.scrollBy({ top: r.top - b.top - b.height / 2 + r.height / 2, behavior: 'smooth' });
    el.classList.add('ring-2', 'ring-[#3D52A0]/40');
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#3D52A0]/40'), 1600);
  };
  const needOf = (text: string): 'notes' | 'owner' | 'due' | null =>
    /from notes/.test(text) ? 'notes' : /no owner/.test(text) ? 'owner' : /no due date/.test(text) ? 'due' : null;
  const notesFor = (lineId: string) => (p.reviewNotes || []).filter((n) => n.lineId === lineId);
  const correctionFor = (lineId: string) => (p.corrections || []).find((k) => k.lineId === lineId);
  const generalNotes = (p.reviewNotes || []).filter((n) => !n.lineId);

  const peopleBySide = useMemo(() => {
    const seen = new Set<string>();
    return p.people.filter((x) => {
      const k = `${x.side}:${x.name.toLowerCase()}`;
      if (!x.name.trim() || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [p.people]);

  return (
    <div className="grid gap-5 p-4 sm:p-5 grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
      {/* left */}
      <div className="space-y-5 min-w-0">
        <Panel icon={Clock} title="The meeting" blurb="Filled from the calendar entry">
          <div className="space-y-3">
            <Chip tone="brand">{meetingTypeLabel(p.meeting.type)}</Chip>
            <div>
              <p className={`${EYEBROW} mb-1.5`}>When</p>
              <p className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800">{fmtWhen(p.meeting.date, p.meeting.end)}</p>
            </div>
            {p.meeting.venue && (
              <div>
                <p className={`${EYEBROW} mb-1.5`}>Where</p>
                <p className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" />{p.meeting.venue}</p>
              </div>
            )}
          </div>
        </Panel>
        <WhoWasThere attendees={c.attendees || []} readOnly={ro} onChange={(attendees) => setC((x) => ({ ...x, attendees }))} />
      </div>

      {/* centre */}
      <div className="space-y-5 min-w-0">
        {p.readOnlyNote}
        {p.revision && (
          <Panel icon={RotateCcw} title={`Revision ${p.revision.number}`} blurb="The client keeps the minutes they have until this is approved and sent. Say what changed: it is printed on the minutes and put in the email.">
            <textarea className={`${input} min-h-[64px]`} disabled={ro} value={c.revisionNote || ''} placeholder="Handle finish corrected to antique brass (A2)."
              onChange={(e) => setC((x) => ({ ...x, revisionNote: e.target.value }))} aria-label="What changed in this revision" />
          </Panel>
        )}
        {generalNotes.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 hud-panel-in">
            <p className="text-sm font-bold text-amber-900 mb-1">Returned with notes</p>
            {generalNotes.map((n) => <p key={n.id} className="text-xs text-amber-900"><b>{n.byName}:</b> {n.text}</p>)}
          </div>
        )}
        {(c.carried || []).length > 0 && (
          <Panel icon={RotateCcw} title="From the last meeting" blurb="Mark what happened to each open action since"
            right={<Chip tone={(c.carried || []).some((k) => !k.outcome) ? 'amber' : 'emerald'}>{(c.carried || []).filter((k) => k.outcome !== 'done' && k.outcome !== 'drop').length} open</Chip>}>
            <div className="divide-y divide-slate-100 -mx-1">
              {(c.carried || []).map((k, i) => (
                <div key={`${k.momId}:${k.actionId}:${i}`} className="flex flex-wrap items-center gap-3 px-1 py-2 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <CircleDot className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm text-slate-800">{k.text}</p>
                    <p className="text-[11px] text-slate-500">{k.ownerName}{k.due ? ` · was due ${fmtShortDay(k.due)}` : ''}{k.ref ? ` · ${k.ref}` : ''}</p>
                  </div>
                  {ro ? <Chip tone={k.outcome === 'done' ? 'emerald' : k.outcome === 'drop' ? 'slate' : 'amber'}>{k.outcome === 'done' ? 'Done' : k.outcome === 'drop' ? 'Dropped' : 'Still open'}</Chip> : (
                    <Seg small label={`What happened to: ${k.text}`} value={k.outcome} onChange={(v) => setCarried(i, v)}
                      options={[{ id: 'done', label: 'Done' }, { id: 'open', label: 'Still open' }, { id: 'drop', label: 'Drop' }]} />
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}
        <Panel icon={ListChecks} title="What was discussed" blurb="One card per topic. Each line is a decision, an action, a note or an open question"
          right={!ro ? <button type="button" className={`${btnSm}`} onClick={() => setC((x) => ({ ...x, topics: [...x.topics, emptyTopic('')] }))}><Plus className="w-3.5 h-3.5" />Topic</button> : undefined}>
          <div className="space-y-3">
            {c.topics.map((t, ti) => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 hud-row-in" style={{ animationDelay: `${ti * 30}ms` }}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 grid place-items-center text-[11px] font-black text-slate-700 tabular-nums shrink-0">{ti + 1}</span>
                  <input className="flex-1 min-w-0 bg-transparent font-bold text-slate-800 outline-none placeholder:text-slate-400 placeholder:font-semibold focus:bg-white focus:ring-2 focus:ring-[#3D52A0]/30 rounded-lg px-1"
                    disabled={ro} value={t.title} placeholder="Name the topic: Kitchen layout" aria-label={`Topic ${ti + 1} name`}
                    onChange={(e) => setTopic(t.id, { title: e.target.value })} />
                  {!ro && <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />}
                  {!ro && c.topics.length > 1 && (
                    <button type="button" onClick={() => removeTopic(t.id)} aria-label={`Remove topic ${t.title || ti + 1}`} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                <div className="space-y-2">
                  {t.lines.map((l) => (
                    <LineEditor key={l.id} line={l} readOnly={ro} people={peopleBySide} meetingDate={p.meeting.date}
                      notes={notesFor(l.id)} correction={correctionFor(l.id)}
                      onChange={(patch) => setLine(t.id, l.id, patch)} onRemove={() => removeLine(t.id, l.id)} />
                  ))}
                  {!ro && <NewPoint onAdd={(text) => addLine(t.id, text)} />}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* right */}
      <div className="space-y-5 min-w-0">
        {!ro && <QuickCapture initial={p.initialNotes || ''} onTurn={async (notes) => {
          const out = await p.onNotesToPoints(notes);
          setC((x) => {
            const keep = x.topics.filter((t) => t.title.trim() || t.lines.length);
            return { ...x, topics: [...keep, ...out.topics], summary: x.summary?.trim() ? x.summary : out.summary || x.summary };
          });
          return out.topics.reduce((n, t) => n + t.lines.length, 0);
        }} />}
        <Panel icon={FileText} title="In brief" blurb="The two lines the client reads first">
          <textarea className={`${input} min-h-[92px] leading-relaxed`} disabled={ro} value={c.summary || ''} aria-label="In brief"
            placeholder="Kitchen layout and wardrobe finish agreed. Revised drawing on Thursday."
            onChange={(e) => setC((x) => ({ ...x, summary: e.target.value }))} />
          {!ro && <BriefButton onWrite={async () => {
            const text = await p.onWriteBrief(latest.current);
            if (text) setC((x) => ({ ...x, summary: text }));
          }} />}
        </Panel>
        <Panel icon={CalendarClock} title="Next meeting" blurb="Printed on the minutes">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={input} disabled={ro} value={c.nextMeeting?.date || ''} aria-label="Next meeting date"
              onChange={(e) => setC((x) => ({ ...x, nextMeeting: { ...(x.nextMeeting || {}), date: e.target.value } }))} />
            <input type="time" className={input} disabled={ro} value={c.nextMeeting?.time || ''} aria-label="Next meeting time"
              onChange={(e) => setC((x) => ({ ...x, nextMeeting: { ...(x.nextMeeting || {}), time: e.target.value } }))} />
          </div>
          <input className={`${input} mt-2`} disabled={ro} value={c.nextMeeting?.purpose || ''} placeholder="Kids room laminate and handles, at the studio" aria-label="Next meeting purpose"
            onChange={(e) => setC((x) => ({ ...x, nextMeeting: { ...(x.nextMeeting || {}), purpose: e.target.value } }))} />
        </Panel>
        <Panel icon={ShieldCheck} title="Before you send" blurb="Checked as you write">
          <ul className="space-y-2">{checks.map((k, i) => (
            <CheckRow key={k.text} c={k} i={i} action={needOf(k.text) ? (
              <button type="button" className={`${linkBtn} shrink-0`} onClick={() => showNext(needOf(k.text)!)}>Show me</button>
            ) : undefined} />
          ))}</ul>
          {checks.some((k) => !k.ok && /from notes/.test(k.text)) && (
            <p className="text-[11px] text-slate-500 mt-3">Read each point marked <b className="text-[#3D52A0]">From notes</b>, then press <b>Looks right</b> on it, or click into it to correct it.</p>
          )}
        </Panel>
      </div>

      {/* the footer row, rendered by the shell through a portal-less slot */}
      <ComposerFooter saved={saved} readOnly={ro} onPreview={() => p.onPreview(latest.current)} primary={p.primary(c, ready)} />
    </div>
  );
}

/* The footer sits at the bottom of the grid on small screens, and is pinned by the shell on large ones. */
function ComposerFooter({ saved, readOnly, onPreview, primary }: { saved: 'saved' | 'saving' | 'error'; readOnly: boolean; onPreview: () => void; primary: React.ReactNode }) {
  return (
    <div className="xl:col-span-3 sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 bg-slate-50 border-t border-slate-100 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
      {!readOnly && (
        <span className="text-xs text-slate-500 inline-flex items-center gap-1.5" aria-live="polite">
          <span className={`w-2 h-2 rounded-full ${saved === 'saved' ? 'bg-emerald-500' : saved === 'saving' ? 'bg-amber-500' : 'bg-rose-500'}`} />
          {saved === 'saved' ? 'Saved' : saved === 'saving' ? 'Saving…' : 'Not saved. Check your connection.'}
        </span>
      )}
      <span className="flex-1" />
      <button type="button" className={btnSec} onClick={onPreview}><Eye className="w-4 h-4" />Preview PDF</button>
      {primary}
    </div>
  );
}

function fmtWhen(start: number, end?: number | null) {
  const day = new Date(start).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const t = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return `${day} · ${t(start)}${end ? ` – ${t(end)}` : ''}`;
}

/* ── Who was there ───────────────────────────────────────────────────────── */

function WhoWasThere({ attendees, readOnly, onChange }: {
  attendees: NonNullable<MinutesContent['attendees']>; readOnly: boolean; onChange: (a: NonNullable<MinutesContent['attendees']>) => void;
}) {
  const [name, setName] = useState('');
  const [side, setSide] = useState<OwnerSide>('client');
  const [adding, setAdding] = useState(false);
  const groups: [string, string][] = [['client', 'Client'], ['ffds', 'Studio'], ['vendor', 'Vendor'], ['unknown', 'Others']];
  const toggle = (i: number) => onChange(attendees.map((a, j) => (j === i ? { ...a, present: a.present === false } : a)));
  return (
    <Panel icon={Users} title="Who was there" blurb="Tick who came. Names come from the meeting">
      {groups.map(([s, label]) => {
        const list = attendees.map((a, i) => ({ a, i })).filter(({ a }) => (a.side === s) || (s === 'unknown' && !['client', 'ffds', 'vendor'].includes(a.side)));
        if (!list.length) return null;
        return (
          <div key={s} className="mb-2">
            <p className={`${EYEBROW} px-2.5 mb-1`}>{label}</p>
            {list.map(({ a, i }) => {
              const here = a.present !== false;
              return (
                <button key={`${a.name}-${i}`} type="button" disabled={readOnly} onClick={() => toggle(i)} aria-pressed={here}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-slate-50 disabled:hover:bg-transparent ${here ? '' : 'opacity-50'}`}>
                  <Avatar name={a.name} side={a.side} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{a.name}</span>
                    {a.role && <span className="block text-[11px] text-slate-500 truncate">{a.role}</span>}
                  </span>
                  <span className={`w-5 h-5 rounded-md grid place-items-center ${here ? 'bg-[#3D52A0] text-white' : 'border border-slate-300'}`}>{here && <Check className="w-3.5 h-3.5" />}</span>
                </button>
              );
            })}
          </div>
        );
      })}
      {!attendees.length && <p className="text-xs text-slate-500 px-2.5">Nobody was listed on the meeting. Add who came.</p>}
      {!readOnly && (adding ? (
        <form className="mt-2 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onChange([...attendees, { name: name.trim(), side, present: true }]);
          setName('');
          setAdding(false);
        }}>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" autoFocus />
          <Seg label="Side" value={side} onChange={setSide} small options={[{ id: 'client', label: 'Client' }, { id: 'ffds', label: 'Studio' }, { id: 'vendor', label: 'Vendor' }]} />
          <div className="flex gap-2"><button type="submit" className={btnSm}>Add</button><button type="button" className={btnSm} onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      ) : (
        <button type="button" className={`${linkBtn} mt-2 ml-2`} onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" />Add someone</button>
      ))}
    </Panel>
  );
}

/* ── One line ────────────────────────────────────────────────────────────── */

function LineEditor({ line, readOnly, people, meetingDate, notes, correction, onChange, onRemove }: {
  key?: React.Key; line: MinutesLine; readOnly: boolean; people: PersonOption[]; meetingDate: number;
  notes: ReviewNote[]; correction?: CorrectionLine; onChange: (p: Partial<MinutesLine>) => void; onRemove: () => void;
}) {
  const cycle = () => {
    const next = KINDS[(KINDS.indexOf(line.kind) + 1) % KINDS.length];
    onChange({ kind: next, ...(needsOwner(next) ? { owner: line.owner ?? null, due: line.due ?? null } : {}) });
  };
  /* Opening a point from notes is checking it. */
  const opened = () => { if (line.fromNotes && !readOnly) onChange({ fromNotes: false }); };
  const ownerKey = line.owner ? `${line.owner.side}|${line.owner.name}` : '';
  const flag = (k: 'scope' | 'cost' | 'drawing') => onChange({ flags: { ...(line.flags || {}), [k]: !line.flags?.[k] } });
  return (
    <div data-from-notes={line.fromNotes ? 'true' : undefined}
      data-needs={[
        line.fromNotes && 'notes',
        line.kind === 'action' && line.text.trim() && !line.owner?.name?.trim() && 'owner',
        line.kind === 'action' && line.text.trim() && !line.due && 'due',
      ].filter(Boolean).join(' ') || undefined}
      className={`rounded-xl border bg-white px-3 py-2.5 ${correction ? 'border-rose-300' : notes.length ? 'border-amber-300' : line.fromNotes ? 'border-[#3D52A0]/40' : 'border-slate-200'}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-1"><KindChip kind={line.kind} onClick={readOnly ? undefined : cycle} title={`${KIND_LABEL[line.kind]}. Tap to change`} /></span>
        <AutoText value={line.text} readOnly={readOnly} onFocus={opened} onChange={(text) => onChange({ text, fromNotes: false })} label={`${KIND_LABEL[line.kind]} text`} />
        {line.fromNotes && <span className="mt-1"><FromNotes onConfirm={readOnly ? undefined : () => onChange({ fromNotes: false })} /></span>}
        {!readOnly && (
          <button type="button" onClick={onRemove} aria-label="Remove this line" className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-slate-50"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
      {needsOwner(line.kind) && (
        <div className="flex items-center gap-2 mt-2 flex-wrap sm:pl-[86px]">
          <label className="sr-only" htmlFor={`own-${line.id}`}>Who does it</label>
          <select id={`own-${line.id}`} disabled={readOnly} value={ownerKey}
            className={`px-2 py-1 rounded-lg border text-xs font-semibold outline-none focus:ring-2 focus:ring-[#3D52A0]/30 ${line.owner?.name ? 'border-slate-200 text-slate-700' : 'border-amber-300 text-amber-800 bg-amber-50'}`}
            onChange={(e) => {
              const [side, ...rest] = e.target.value.split('|');
              const name = rest.join('|');
              const who = people.find((x) => x.side === side && x.name === name);
              onChange({ owner: name ? { side: side as OwnerSide, name, email: who?.email || null } : null, fromNotes: false });
            }}>
            <option value="">Who does it?</option>
            {(['client', 'ffds', 'vendor'] as OwnerSide[]).map((s) => {
              const list = people.filter((x) => x.side === s);
              const extra = line.owner && line.owner.side === s && !list.some((x) => x.name === line.owner!.name) ? [{ name: line.owner.name, side: s }] : [];
              const all = [...list, ...extra];
              return all.length ? (
                <optgroup key={s} label={SIDE_LABEL[s]}>
                  {all.map((x) => <option key={`${s}|${x.name}`} value={`${s}|${x.name}`}>{x.name}{(x as PersonOption).role ? ` · ${(x as PersonOption).role}` : ''}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 ${line.due ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <input type="date" disabled={readOnly} value={keyOfDue(line.due)} aria-label="Due date"
              className="text-xs font-semibold text-slate-700 bg-transparent outline-none"
              onChange={(e) => onChange({ due: dueFromKey(e.target.value), fromNotes: false })} />
          </span>
          {!readOnly && !line.due && (
            <span className="inline-flex p-0.5 rounded-lg bg-slate-100">
              {quickDues(meetingDate).map((q) => (
                <button key={q.label} type="button" onClick={() => onChange({ due: q.at, fromNotes: false })} className="px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-800">{q.label}</button>
              ))}
            </span>
          )}
          {line.kind === 'action' && (['scope', 'cost', 'drawing'] as const).map((k) => (
            <button key={k} type="button" disabled={readOnly} onClick={() => flag(k)} aria-pressed={!!line.flags?.[k]}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${line.flags?.[k] ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-white border border-dashed border-slate-300 text-slate-400 hover:text-slate-600'} disabled:cursor-default`}>
              {k === 'cost' ? 'Cost impact' : k === 'scope' ? 'Scope' : 'Drawing'}
            </button>
          ))}
        </div>
      )}
      {notes.map((n) => (
        <div key={n.id} className="mt-2 sm:ml-[86px] rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 flex gap-2 items-start">
          <MessageSquare className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" /><p className="text-xs text-amber-900"><b>{n.byName}:</b> {n.text}</p>
        </div>
      ))}
      {correction && (
        <div className="mt-2 sm:ml-[86px] rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 flex gap-2 items-start">
          <RotateCcw className="w-3.5 h-3.5 text-rose-700 mt-0.5 shrink-0" /><p className="text-xs text-rose-900"><b>The client{correction.ref ? ` on ${correction.ref}` : ''}:</b> {correction.text}</p>
        </div>
      )}
    </div>
  );
}

/** A text field that grows with its words. */
function AutoText({ value, onChange, readOnly, onFocus, label }: { value: string; onChange: (v: string) => void; readOnly: boolean; onFocus?: () => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={1} value={value} readOnly={readOnly} onFocus={onFocus} aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 resize-none bg-transparent text-sm text-slate-800 outline-none leading-relaxed focus:bg-slate-50 rounded-md px-1 -mx-1" />
  );
}

/** "Type a point…": Enter adds it, sorted into a kind by its words. */
function NewPoint({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-3 py-2 flex items-center gap-3 focus-within:border-[#3D52A0]/50"
      onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text); setText(''); } }}>
      <input className="flex-1 min-w-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Type a point… “Client to send tile choice by Friday”" aria-label="Add a point" />
      <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 shrink-0"><CornerDownLeft className="w-3.5 h-3.5" />sorts it for you</span>
    </form>
  );
}

/* ── Quick capture ───────────────────────────────────────────────────────── */

function QuickCapture({ onTurn, initial }: { onTurn: (notes: string) => Promise<number>; initial: string }) {
  const [mode, setMode] = useState<'paste' | 'speak'>('paste');
  const [notes, setNotes] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  const Speech: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  const listen = () => {
    if (!Speech) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Speech();
    r.lang = 'en-IN';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: any) => {
      let said = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += `${e.results[i][0].transcript} `;
      if (said.trim()) setNotes((n) => `${n}${n && !n.endsWith('\n') ? ' ' : ''}${said.trim()}.`);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };
  useEffect(() => () => rec.current?.stop(), []);

  return (
    <Panel icon={Sparkles} title="Quick capture" blurb="Turn rough notes into points">
      <Seg label="How to capture" value={mode} onChange={setMode} options={[{ id: 'paste', label: 'Paste notes' }, { id: 'speak', label: 'Speak' }]} />
      {mode === 'speak' && (
        Speech
          ? <button type="button" onClick={listen} className={`${btnSec} w-full mt-3`}>{listening ? <><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />Listening… tap to stop</> : <><Mic className="w-4 h-4" />Start speaking</>}</button>
          : <p className="text-xs text-slate-500 mt-3">This browser cannot listen. Use Chrome, or paste your notes.</p>
      )}
      <textarea className={`${input} mt-3 min-h-[112px] text-xs leading-relaxed`} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Rough notes"
        placeholder="kitchen L shape ok tall unit left wall. tanvi to send elevation thu. AC drain behind TV wall?? check w site" />
      <button type="button" className={`${btnPri} w-full mt-3`} disabled={!notes.trim() || busy} onClick={async () => {
        setBusy(true);
        setMsg(null);
        try {
          const n = await onTurn(notes);
          setNotes('');
          setMsg(n ? `${n} point${n === 1 ? '' : 's'} added. Check each one.` : 'Nothing could be read from these notes.');
        } catch (e: any) {
          setMsg(e?.message || 'Could not read the notes. Try again.');
        } finally {
          setBusy(false);
        }
      }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Turn into points</button>
      <p className="text-[11px] text-slate-500 mt-2" aria-live="polite">{msg || <>Every point it adds is marked <b className="text-[#3D52A0]">From notes · check</b> until you open it.</>}</p>
    </Panel>
  );
}

function BriefButton({ onWrite }: { onWrite: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={`${linkBtn} mt-2`} disabled={busy} onClick={async () => {
      setBusy(true);
      try { await onWrite(); } catch { /* the field stays as it was */ } finally { setBusy(false); }
    }}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Write it from the points</button>
  );
}
