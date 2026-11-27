import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Mic, Square, Upload, Check, ArrowRight, Scale, HardHat, NotebookPen, Table } from '@/lib/lucide-shim';
import { Button, Chip, INPUT, Segmented } from '../ui/kit';
import { Masked } from '../ui/HideFigures';
import type { Item, SnagItem } from '../../types';
import { RECORD_GROUPS, SOURCE_LABEL, filingPlan, scopeCheck, type NotesRead, type RecordItem, type RecordSource } from '../../lib/smartRecord';
import { dayKey } from '../../lib/opsDesk';
import { blobToBase64, readNotes } from '../../services/opsAssistService';
import { logFollowUp, raiseEscalation } from '../../services/opsDeskService';
import { saveDecision } from '../../services/decisionsService';

/*
  SMART RECORD (smart workspace, PR 3, ideas G and H; lib/smartRecord).

  "From notes" on Whole project's Record bar. A person types, pastes or speaks
  their notes from a site visit, a meeting or a call; the AI sorts them; the
  person ticks what to keep and files it:

    decisions       drafts on Record Decision, sent for sign-off from there;
    snags           the project's snag list;
    promises, dates and questions
                    the follow-up log, each with its own next step (so the
                    Ops Desk too);
    extra work      the scope-creep catcher: whether it is already in the BOQ
                    and what the Item bank would price it at, then "Draft scope
                    addition" (Scope Additions opens with the request written
                    in). For a role that cannot open Scope Additions, extra
                    work goes to the leads as an escalation, as the Ops Desk's
                    capture does.

  Nothing is sent to the client. The window follows the workspace's window
  pattern (phd-scrim, phd-pop, rounded-3xl).
*/

const MAX_AUDIO_BYTES = 7 * 1024 * 1024;
const MAX_RECORD_MS = 5 * 60 * 1000;
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const KIND_ICON: Partial<Record<RecordItem['kind'], React.ElementType>> = { decision: Scale, snag: HardHat, extra_work: Table };

export interface FiledSummary { decisions: number; snags: number; followUps: number; escalations: number; extras: RecordItem[] }

export interface SmartRecordProps {
  projectId: string;
  projectName: string;
  clientName: string;
  tenantId: string;
  me: { email: string; name: string };
  rooms: string[];
  /** Who logs a snag, for the snag list's "raised by". */
  raisedBy: SnagItem['raisedBy'];
  /** Adds snags to the project's snag list (the project's own context); none when this person cannot change the project. */
  onAddSnags?: (snags: SnagItem[]) => void;
  /** May open Scope Additions: extra work becomes a scope addition to draft; otherwise an escalation for the leads. */
  canPrice: boolean;
  /** Sees the studio's rates (the Item bank's sell price). */
  seesRates: boolean;
  boq: Array<{ id?: string; name?: string; unit?: string }>;
  bank: Item[];
  canOpen: (route: string) => boolean;
  onOpen: (route: string) => void;
  onDraftScope: (request: string) => void;
  /** A line was written to the follow-up log: the story shows it at once. */
  onLogged: (line: any) => void;
  onClose: () => void;
}

export default function SmartRecord(p: SmartRecordProps) {
  const [source, setSource] = useState<RecordSource>('site_visit');
  const [mode, setMode] = useState<'type' | 'speak'>('type');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopTimer = () => { if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => { stopTimer(); recRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const [reading, setReading] = useState(false);
  const [notes, setNotes] = useState<NotesRead | null>(null);
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState<FiledSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Esc closes, as the screen window does; the window takes focus. */
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !filing) p.onClose(); };
    window.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [filing, p.onClose]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); stopTimer(); setRecording(false); setAudio(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
      recRef.current = rec;
      rec.start();
      setAudio(null); setRecording(true);
      const started = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => { const ms = Date.now() - started; setElapsed(ms); if (ms >= MAX_RECORD_MS && rec.state === 'recording') rec.stop(); }, 500);
    } catch {
      setError('The microphone is blocked. Allow it in the browser, or choose a recording instead.');
    }
  };
  const stopRecording = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };
  const pickFile = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_AUDIO_BYTES) { setError('That recording is too long. Keep it under about five minutes.'); return; }
    setAudio(f);
  };

  const read = async () => {
    setReading(true); setError(null);
    try {
      const today = dayKey(Date.now());
      const ctx = { clientName: p.clientName, source: SOURCE_LABEL[source], rooms: p.rooms };
      const n = mode === 'speak' && audio
        ? await readNotes({ audio: { mimeType: (audio.type || 'audio/webm').split(';')[0], base64: await blobToBase64(audio) } }, today, ctx)
        : await readNotes({ text }, today, ctx);
      if (!n.items.length) setError('Nothing to file was found. Add a little more to the notes, or check it is the right recording.');
      setNotes(n);
    } catch (e: any) {
      setError(e?.code === 'functions/resource-exhausted' ? 'Too many AI requests just now. Try again in a few minutes.'
        : e?.code === 'functions/permission-denied' ? 'Your account cannot use the AI. Ask a lead.'
        : 'The AI did not answer. Check your connection and try again.');
    } finally { setReading(false); }
  };

  const setItem = (id: string, patch: Partial<RecordItem>) => setNotes((n) => (n ? { ...n, items: n.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : n));
  /* A snag needs someone who can change the project; a decision, someone who can open Record Decision. */
  const usable = (i: RecordItem) => (i.kind === 'snag' ? !!p.onAddSnags : i.kind === 'decision' ? p.canOpen('record-decision') : true);
  const plan = useMemo(() => (notes ? filingPlan({ ...notes, items: notes.items.filter(usable) }, source, dayKey(Date.now()), p.raisedBy, p.clientName) : null), [notes, source, p.raisedBy, p.clientName, p.onAddSnags]);
  const checks = useMemo(() => {
    const out: Record<string, ReturnType<typeof scopeCheck>> = {};
    (notes?.items || []).filter((i) => i.kind === 'extra_work').forEach((i) => { out[i.id] = scopeCheck(i.text, p.boq, p.bank); });
    return out;
  }, [notes, p.boq, p.bank]);

  const file = async () => {
    if (!plan) return;
    setFiling(true); setError(null);
    const done: FiledSummary = { decisions: 0, snags: 0, followUps: 0, escalations: 0, extras: [] };
    try {
      const channel = source === 'call' ? 'call' : 'meeting';
      for (const f of plan.followUps) {
        const line = await logFollowUp({
          tenantId: p.tenantId, projectId: p.projectId, projectName: p.projectName, me: p.me, channel, outcome: f.outcome, note: f.note, subject: null,
          next: f.next ? { text: f.next.text, ownerEmail: p.me.email, ownerName: p.me.name, due: f.next.due } : null,
        } as any);
        p.onLogged(line);
        done.followUps++;
      }
      for (const d of plan.decisions) {
        await saveDecision(p.projectId, { ...d, clientName: p.clientName, projectName: p.projectName } as any);
        done.decisions++;
      }
      if (plan.snags.length && p.onAddSnags) {
        const now = Date.now();
        p.onAddSnags(plan.snags.map((s, i) => ({ ...s, id: `snag_${now.toString(36)}${i}`, raisedAt: now })));
        done.snags = plan.snags.length;
      }
      if (p.canPrice) done.extras = plan.extras;
      else {
        for (const x of plan.extras) {
          await raiseEscalation({ tenantId: p.tenantId, projectId: p.projectId, projectName: p.projectName, me: p.me, title: `Extra work asked for: ${x.text}`.slice(0, 200), detail: `${SOURCE_LABEL[source]}. ${notes?.summary || ''}`.slice(0, 2000), category: 'scope', subjectKey: null } as any);
          done.escalations++;
        }
      }
      setFiled(done);
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'You cannot file on this project. Ask a lead to assign it to you.' : 'Not everything was filed. Check the follow-up log and Record Decision before trying again.');
      if (done.followUps || done.decisions || done.snags) setFiled(done);
    } finally { setFiling(false); }
  };

  const picked = notes ? notes.items.filter((i) => i.selected && usable(i)).length : 0;
  const mins = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  const footer = filed ? (
    <Button variant="primary" onClick={p.onClose}>Done</Button>
  ) : notes ? (
    <>
      <Button variant="secondary" onClick={() => setNotes(null)} disabled={filing}>Back to the notes</Button>
      <Button variant="primary" icon={Check} onClick={file} disabled={filing || !picked}>{filing ? 'Filing…' : `File ${picked === 1 ? '1 item' : `${picked} items`}`}</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={p.onClose}>Cancel</Button>
      <Button variant="primary" icon={Sparkles} onClick={read} disabled={reading || recording || (mode === 'type' ? text.trim().length < 15 : !audio)}>{reading ? 'Reading…' : 'Read it'}</Button>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[310]">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => !filing && p.onClose()} aria-hidden />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Record from notes"
        className="phd-pop absolute inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 top-4 bottom-4 sm:w-[min(760px,calc(100vw-2rem))] bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden outline-none">
        <div className="shrink-0 flex items-center gap-3 px-5 sm:px-6 py-3 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0] truncate">{p.projectName} · Record</p>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Record from notes</h2>
          </div>
          <button type="button" onClick={p.onClose} disabled={filing} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-xl border border-slate-300 text-slate-500 hover:text-[#3D52A0] hover:border-[#3D52A0] shrink-0">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col gap-4">
          {filed ? (
            <Filed s={filed} canOpen={p.canOpen} onOpen={(r) => { p.onClose(); p.onOpen(r); }} checks={checks} seesRates={p.seesRates}
              onDraftScope={(t) => { p.onClose(); p.onDraftScope(t); }} />
          ) : notes ? (
            <>
              {notes.summary && <p className="text-[13px] text-slate-700 rounded-2xl bg-[#F7F9FF] px-4 py-3">{notes.summary}</p>}
              {RECORD_GROUPS.map((g) => {
                const items = notes.items.filter((i) => i.kind === g.kind);
                if (!items.length) return null;
                const Icon = KIND_ICON[g.kind] || NotebookPen;
                return (
                  <section key={g.kind} aria-label={g.label} className="hud-panel-in">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <h3 className="text-[13px] font-bold text-slate-800">{g.label}</h3>
                      <span className="text-[11px] text-slate-500">{g.becomes}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {items.map((i, n) => {
                        const off = !usable(i);
                        const c = checks[i.id];
                        return (
                          <div key={i.id} className={cx('hud-row-in rounded-xl px-3 py-2.5', i.kind === 'extra_work' ? 'bg-amber-50' : 'bg-[#F7F9FF]', off && 'opacity-60')} style={{ animationDelay: `${n * 40}ms` }}>
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#3D52A0] shrink-0" checked={i.selected && !off} disabled={off}
                                onChange={(e) => setItem(i.id, { selected: e.target.checked })} aria-label={i.text} />
                              <Icon className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] text-slate-800">{i.text}</span>
                                <span className="block text-[11px] text-slate-500">
                                  {[i.room, i.due && `by ${new Date(`${i.due}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, i.category, i.severity && `${i.severity} severity`].filter(Boolean).join(' · ')}
                                  {off ? (i.kind === 'snag' ? 'Your role cannot change the snag list on this project.' : 'Your role cannot record decisions on this project.') : ''}
                                </span>
                              </span>
                            </label>
                            {c && <ScopeLine check={c} seesRates={p.seesRates} canPrice={p.canPrice} />}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              <p className="text-[11px] text-slate-500">Nothing is filed until you press File, and nothing goes to the client.</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented label="What the notes are from" value={source} onChange={setSource}
                  options={[{ id: 'site_visit', label: 'Site visit' }, { id: 'meeting', label: 'Meeting' }, { id: 'call', label: 'Call' }]} />
                <Segmented label="How to give the notes" value={mode} onChange={(m) => { setMode(m); setError(null); }}
                  options={[{ id: 'type', label: 'Type or paste' }, { id: 'speak', label: 'Speak' }]} />
              </div>
              <p className="text-xs text-slate-500">Write it the way you would in WhatsApp. Decisions, snags, extra work, promises and dates are picked out for you to tick.</p>
              {mode === 'type' ? (
                <textarea id="smart-record-notes" value={text} onChange={(e) => setText(e.target.value)} rows={9} autoFocus
                  placeholder="client ok with living layout. wants pooja unit in passage. hall ceiling off by 20mm, fix before paint. will pay balance by friday."
                  aria-label="Notes" className={cx(INPUT, 'resize-y min-h-[180px]')} />
              ) : (
                <div className="rounded-2xl bg-[#F7F9FF] px-4 py-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {recording
                      ? <Button variant="primary" icon={Square} onClick={stopRecording}>Stop · {mins(elapsed)}</Button>
                      : <Button variant="primary" icon={Mic} onClick={startRecording}>{audio ? 'Record again' : 'Start recording'}</Button>}
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#3D52A0] hover:bg-[#3D52A0]/10 cursor-pointer">
                      <Upload className="w-4 h-4" aria-hidden />Choose a recording
                      <input type="file" accept="audio/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                    </label>
                  </div>
                  {audioUrl && <audio controls src={audioUrl} className="w-full" />}
                  <p className="text-[11px] text-slate-500">Up to five minutes. The recording is read by the studio's AI and is not kept.</p>
                </div>
              )}
            </>
          )}
          {error && <p className="text-xs text-rose-700" role="alert">{error}</p>}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 sm:px-6 py-3 border-t border-slate-100">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

/* The scope-creep catcher, under one piece of extra work. */
function ScopeLine({ check, seesRates, canPrice }: { check: ReturnType<typeof scopeCheck>; seesRates: boolean; canPrice: boolean }) {
  const best = check.bank[0];
  return (
    <div className="mt-2 ml-11 flex flex-col gap-0.5 text-xs">
      {check.inBoq
        ? <p className="text-slate-600">Reads as a line already in the BOQ: <b className="text-slate-800">{check.inBoq.name}</b>. It may not be extra.</p>
        : <p className="text-amber-800 font-semibold">Not in the BOQ by name.</p>}
      {best && (
        <p className="text-slate-600">
          From your Item bank: <b className="text-slate-800">{best.name}</b>
          {seesRates && best.rate > 0 && <> · <Masked>{inr(best.rate)}</Masked>{best.unit ? ` per ${best.unit}` : ''}</>}
          {check.bank.length > 1 && <span className="text-slate-400"> · also {check.bank.slice(1).map((b) => b.name).join(', ')}</span>}
        </p>
      )}
      <p className="text-slate-500">{canPrice ? 'After filing, draft it as a scope addition.' : 'Filing sends it to the leads to decide, as the Ops Desk does.'}</p>
    </div>
  );
}

/* What was filed, and the next steps: open what was made, draft a scope addition for extra work. */
function Filed({ s, canOpen, onOpen, onDraftScope, checks, seesRates }: {
  s: FiledSummary; canOpen: (r: string) => boolean; onOpen: (r: string) => void; onDraftScope: (text: string) => void;
  checks: Record<string, ReturnType<typeof scopeCheck>>; seesRates: boolean;
}) {
  const rows: Array<{ n: number; one: string; many: string; route: string | null; label: string }> = [
    { n: s.decisions, one: '1 decision', many: `${s.decisions} decisions`, route: 'record-decision', label: 'saved as a draft on Record Decision' },
    { n: s.snags, one: '1 snag', many: `${s.snags} snags`, route: 'site-quality', label: 'added to the snag list' },
    { n: s.followUps, one: '1 line', many: `${s.followUps} lines`, route: null, label: 'in the follow-up log, with their next steps' },
    { n: s.escalations, one: '1 piece of extra work', many: `${s.escalations} pieces of extra work`, route: null, label: 'sent to the leads to decide' },
  ];
  return (
    <div className="flex flex-col gap-3 hud-panel-in">
      <div className="flex items-center gap-2 text-emerald-700"><Check className="w-5 h-5" aria-hidden /><h3 className="text-[15px] font-bold">Filed</h3></div>
      <div className="flex flex-col gap-1.5">
        {rows.filter((r) => r.n > 0).map((r) => (
          <div key={r.one} className="flex items-center gap-3 rounded-xl bg-[#F7F9FF] px-3 py-2">
            <p className="min-w-0 flex-1 text-[13px] text-slate-700"><b className="text-slate-800">{r.n === 1 ? r.one : r.many}</b> {r.label}</p>
            {r.route && canOpen(r.route) && <Button size="sm" variant="secondary" onClick={() => onOpen(r.route!)}>Open<ArrowRight className="w-3.5 h-3.5" aria-hidden /></Button>}
          </div>
        ))}
      </div>
      {s.extras.length > 0 && (
        <section aria-label="Possible extra work" className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-bold text-slate-800">Possible extra work</h3>
          {s.extras.map((x) => {
            const c = checks[x.id];
            return (
              <div key={x.id} className="rounded-xl bg-amber-50 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800">{x.text}</p>
                  {c && <p className="text-xs text-slate-600">{c.inBoq ? `Reads as ${c.inBoq.name} in the BOQ` : 'Not in the BOQ by name'}{c.bank[0] ? ` · Item bank: ${c.bank[0].name}` : ''}{seesRates && c.bank[0]?.rate ? <> · <Masked>{inr(c.bank[0].rate)}</Masked>{c.bank[0].unit ? ` per ${c.bank[0].unit}` : ''}</> : null}</p>}
                </div>
                <Chip tone="warn">Extra?</Chip>
                <Button size="sm" variant="primary" onClick={() => onDraftScope(x.text)}>Draft scope addition</Button>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500">Drafting opens Scope Additions with the request written in. Nothing is priced or sent until you do it there.</p>
        </section>
      )}
    </div>
  );
}
