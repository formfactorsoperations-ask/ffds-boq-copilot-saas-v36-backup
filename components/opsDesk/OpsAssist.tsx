import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../projectHeader/projectHeader.css';
import { Mic, Square, Upload, Check, Copy, Search, Sparkles, NotebookPen, CalendarClock } from '@/lib/lucide-shim';
import { dayKey, inr, type Escalation, type FollowUp, type WaitingItem } from '../../lib/opsDesk';
import {
  CAPTURE_GROUPS, buildProjectBrief, captureToRecords, meetingPrep, agendaText,
  type Capture, type CaptureKind, type ProjectBrief,
} from '../../lib/opsAssist';
import { loadProjectOps, logFollowUp, raiseEscalation } from '../../services/opsDeskService';
import { askProject, blobToBase64, captureConversation, prepNotes, safeProjectView, type Answer } from '../../services/opsAssistService';
import { Sheet, Label, input, btnPri, btnSec, btnSm, type DeskProject, type Person } from './OpsDeskPanels';
import { Dot } from '../ui/HudBits';

/*
  THE OPS DESK'S SMART ASSIST (lib/opsAssist.ts, services/opsAssistService.ts).

  Capture a chat or call, ask a project, and prepare for a client meeting. The
  AI reads only the project brief, which is built from the copy of a project
  without the studio's side of the money, and nothing it says is saved until
  the executive has read and ticked it.
*/

const fmtDay = (key?: string | null) => (key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const sub = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const errorText = (e: any) =>
  e?.code === 'functions/resource-exhausted' ? 'Too many AI requests just now. Try again in a few minutes.'
    : e?.code === 'functions/permission-denied' ? 'Your account cannot use the AI. Ask a lead.'
    : 'The AI did not answer. Check your connection and try again.';

const Seg: React.FC<{ value: string; options: { id: string; label: string }[]; onChange: (v: any) => void; label: string }> = ({ value, options, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
    {options.map((o) => (
      <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
        className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${value === o.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{o.label}</button>
    ))}
  </div>
);
const Thinking: React.FC<{ text: string }> = ({ text }) => (
  <p className="flex items-center gap-2 text-xs text-slate-500 py-1"><Dot tone="warn" live />{text}</p>
);
const ErrorLine: React.FC<{ text: string | null }> = ({ text }) => (text ? <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{text}</p> : null);

/* ── The brief for one project, loaded when it is chosen ─────────────────── */

/** Everything the assist reads about one project: its records, run through the copy without the studio's money. */
function useBrief(tenantId: string, raw: any | null, waiting: WaitingItem[]) {
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const id = raw?.id ? String(raw.id) : '';
  useEffect(() => {
    if (!id || !tenantId) { setBrief(null); return; }
    let live = true;
    setLoading(true);
    const name = String(raw?.context?.name || 'Project');
    loadProjectOps(tenantId, { id, name })
      .then((ops) => {
        if (!live) return;
        setBrief(buildProjectBrief(safeProjectView(raw), { followUps: ops.followUps as FollowUp[], escalations: ops.escalations as Escalation[], decisions: ops.decisions, moms: ops.moms }, waiting, Date.now()));
      })
      .catch(() => live && setBrief(null))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // The waiting list is rebuilt on every desk refresh; the brief follows the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, id]);
  return { brief, loading };
}

const ProjectPick: React.FC<{ id: string; projects: DeskProject[]; value: string; onChange: (v: string) => void; label?: string }> = ({ id, projects, value, onChange, label = 'Project' }) => (
  <div>
    <Label htmlFor={id}>{label}</Label>
    <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a project</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.clientName ? ` · ${p.clientName}` : ''}</option>)}
    </select>
  </div>
);

/* ── Capture a chat or a call ─────────────────────────────────────────────── */

const MAX_AUDIO_BYTES = 7 * 1024 * 1024;
const MAX_RECORD_MS = 5 * 60 * 1000;

export function CapturePanel({ projects, waiting, me, tenantId, prefillProjectId, onClose, onSaved }: {
  projects: DeskProject[];
  waiting: WaitingItem[];
  me: Person;
  tenantId: string;
  prefillProjectId?: string;
  onClose: () => void;
  onSaved: (escalated: boolean) => void;
}) {
  const [projectId, setProjectId] = useState(prefillProjectId || projects[0]?.id || '');
  const project = projects.find((p) => p.id === projectId);
  const options = waiting.filter((w) => w.projectId === projectId);
  const [subjectKey, setSubjectKey] = useState('');
  const subject = options.find((w) => w.key === subjectKey) || null;

  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const [reading, setReading] = useState(false);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopTimer = () => { if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => { stopTimer(); recRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        setRecording(false);
        setAudio(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };
      recRef.current = rec;
      rec.start();
      setAudio(null);
      setRecording(true);
      const started = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - started;
        setElapsed(ms);
        if (ms >= MAX_RECORD_MS && rec.state === 'recording') rec.stop();
      }, 500);
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
    if (!project) return;
    setReading(true);
    setError(null);
    try {
      const today = dayKey(Date.now());
      const c = mode === 'voice' && audio
        ? await captureConversation({ audio: { mimeType: (audio.type || 'audio/webm').split(';')[0], base64: await blobToBase64(audio) } }, today, project.clientName)
        : await captureConversation({ text }, today, project.clientName);
      if (!c.summary && !c.items.length) setError('Nothing to act on was found. Check it is the right chat, or add more of it.');
      setCapture(c);
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  };

  const setItem = (id: string, patch: Partial<Capture['items'][number]>) =>
    setCapture((c) => (c ? { ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : c));

  const records = useMemo(() => (capture ? captureToRecords(capture, mode === 'voice' ? 'Call' : 'WhatsApp chat', dayKey(Date.now())) : null), [capture, mode]);

  const save = async () => {
    if (!project || !records) return;
    setSaving(true);
    setError(null);
    try {
      const channel = mode === 'voice' ? 'call' : 'whatsapp';
      const subj = subject ? { kind: subject.kind, key: subject.key, label: subject.label } : null;
      for (const l of records.lines) {
        await logFollowUp({
          tenantId, projectId: project.id, projectName: project.name, me, channel,
          outcome: l.withSubject && subj ? (l.outcome === 'promised' ? 'promised' : 'replied') : l.outcome,
          note: l.note, subject: l.withSubject ? subj : null,
          next: l.next ? { text: l.next.text, ownerEmail: me.email, ownerName: me.name, due: l.next.due } : null,
        });
      }
      for (const e of records.escalations) {
        await raiseEscalation({ tenantId, projectId: project.id, projectName: project.name, me, title: e.title, detail: e.detail, category: e.category, subjectKey: null });
      }
      onSaved(records.escalations.length > 0);
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'You cannot log on this project. Ask a lead to assign it to you.' : 'Not everything was saved. Check the follow-up log before trying again.');
      setSaving(false);
    }
  };

  const picked = capture?.items.filter((i) => i.selected).length || 0;
  const mins = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <Sheet eyebrow="Smart assist" title="Capture a chat or call"
      sub="Paste a WhatsApp chat or record a voice note after a call. Promises, dates and questions become follow-ups once you tick them."
      onClose={onClose}
      footer={capture ? <>
        <button type="button" className={btnSec} onClick={() => setCapture(null)} disabled={saving}>Back</button>
        <button type="button" className={btnPri} onClick={save} disabled={saving || !project}>
          <Check className="w-4 h-4" />{saving ? 'Saving…' : `Save ${records ? records.lines.length + records.escalations.length : 0} to the desk`}
        </button>
      </> : <>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} onClick={read} disabled={reading || recording || !project || (mode === 'chat' ? text.trim().length < 20 : !audio)}>
          <Sparkles className="w-4 h-4" />{reading ? 'Reading…' : 'Read it'}
        </button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProjectPick id="cap-project" projects={projects} value={projectId} onChange={(v) => { setProjectId(v); setSubjectKey(''); }} />
        <div>
          <Label htmlFor="cap-subject">About</Label>
          <select id="cap-subject" className={input} value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
            <option value="">Something else</option>
            {options.map((w) => <option key={w.key} value={w.key}>{w.kind === 'payment' ? 'Payment' : 'Decision'}: {w.label}</option>)}
          </select>
        </div>
      </div>

      {!capture && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-800">The conversation</span>
            <span className="ml-auto"><Seg label="Source" value={mode} onChange={(m) => { setMode(m); setError(null); }}
              options={[{ id: 'chat', label: 'Paste a chat' }, { id: 'voice', label: 'Voice note' }]} /></span>
          </div>
          {mode === 'chat' ? (
            <>
              <textarea aria-label="Chat" className={`${input} min-h-[180px] leading-relaxed`} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={'In WhatsApp: open the chat, ⋮ → More → Export chat → Without media, or select the messages and copy. Paste them here.'} />
              <p className="text-[11px] text-slate-500">Only this chat is read, once. It is not stored; what you save is the summary and the lines you tick.</p>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {recording
                  ? <button type="button" className={btnPri} onClick={stopRecording}><Square className="w-4 h-4" />Stop · {mins(elapsed)}</button>
                  : <button type="button" className={btnPri} onClick={startRecording}><Mic className="w-4 h-4" />{audio ? 'Record again' : 'Record'}</button>}
                <label className={`${btnSec} cursor-pointer`}>
                  <Upload className="w-4 h-4" />Choose a recording
                  <input type="file" accept="audio/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
                {recording && <span className="flex items-center gap-2 text-xs text-slate-500"><Dot tone="bad" live />Recording, up to five minutes</span>}
              </div>
              {audioUrl && !recording && (
                <div className="flex flex-wrap items-center gap-3 hud-row-in">
                  <audio controls src={audioUrl} className="h-9 max-w-full" />
                  <span className="text-[11px] text-slate-500">{Math.max(1, Math.round((audio?.size || 0) / 1024))} KB</span>
                </div>
              )}
              <p className="text-[11px] text-slate-500">Right after a call, say what was agreed in your own words: who promised what, by when, and anything new they asked for.</p>
            </div>
          )}
          {reading && <Thinking text="Reading the conversation…" />}
        </div>
      )}

      {capture && (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 hud-row-in">
            <p className={sub}>What was said</p>
            <p className="text-[13px] text-slate-700 mt-1">{capture.summary || 'No summary.'}</p>
            {capture.mood && (
              <p className="flex items-center gap-2 text-xs text-slate-500 mt-2"><Dot tone={/anx|worr|upset|angry|unhappy|frustr|delay/i.test(capture.mood) ? 'warn' : 'ok'} />
                <span><b className="font-semibold text-slate-700">{capture.mood}</b>{capture.moodQuote ? ` · "${capture.moodQuote}"` : ''}</span></p>
            )}
          </div>
          {!capture.items.length ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">No promises, dates or questions found. Saving adds just the summary to the log.</p>
          ) : CAPTURE_GROUPS.map((g) => {
            const list = capture.items.filter((i) => i.kind === g.kind);
            if (!list.length) return null;
            return (
              <div key={g.kind}>
                <p className="flex items-center gap-2 mb-2"><span className={sub}>{g.label}</span><span className="text-[11px] text-slate-500">→ {g.becomes}</span></p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {list.map((i, n) => (
                    <div key={i.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 hud-row-in ${i.selected ? '' : 'opacity-60'}`} style={{ animationDelay: `${n * 30}ms` }}>
                      <input type="checkbox" aria-label={`Keep: ${i.text}`} checked={i.selected} onChange={(e) => setItem(i.id, { selected: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 accent-[#3D52A0]" />
                      <div className="flex-1 min-w-[200px]">
                        <input aria-label="Text" className={input} value={i.text} maxLength={300} onChange={(e) => setItem(i.id, { text: e.target.value })} />
                      </div>
                      {(g.kind as CaptureKind) !== 'extra_work' && (
                        <div className="w-[160px] shrink-0">
                          <input aria-label="By when" type="date" className={input} value={i.due || ''} onChange={(e) => setItem(i.id, { due: e.target.value || null })} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500">
            {picked} ticked. Saved in your name as {mode === 'voice' ? 'a call' : 'a WhatsApp'}{subject ? `, about ${subject.label}` : ''}. Items without a date are due in two or three days. Extra work goes to the leads; never quote a price for it.
          </p>
        </>
      )}
      <ErrorLine text={error} />
    </Sheet>
  );
}

/* ── Ask a project ────────────────────────────────────────────────────────── */

const SUGGESTED = [
  'When is the handover?',
  'What does the client still owe?',
  'Which decisions are we waiting on?',
  'What did we promise at the last meeting?',
];

export function AskProjectPanel({ projects, rawProjects, waiting, tenantId }: {
  projects: DeskProject[];
  rawProjects: any[];
  waiting: WaitingItem[];
  tenantId: string;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const raw = rawProjects.find((p) => String(p?.id) === projectId) || null;
  const { brief, loading } = useBrief(tenantId, raw, waiting);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState<{ q: string; a: Answer }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => { setAnswers([]); setError(null); }, [projectId]);

  const ask = async (q: string) => {
    if (!brief || !q.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const a = await askProject(brief, q.trim());
      setAnswers((list) => [{ q: q.trim(), a }, ...list].slice(0, 8));
      setQuestion('');
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setAsking(false);
    }
  };
  const copy = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); window.setTimeout(() => setCopied(null), 2000); } catch { setError('Copying is blocked here. Select the reply and copy it yourself.'); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 items-end">
        <ProjectPick id="ask-project" projects={projects} value={projectId} onChange={setProjectId} />
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
          <div className="flex-1 min-w-0">
            <Label htmlFor="ask-q">Question</Label>
            <input id="ask-q" className={input} maxLength={500} placeholder="e.g. When is the carpentry starting?" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!brief} />
          </div>
          <button type="submit" className={`${btnPri} self-end`} disabled={asking || !brief || !question.trim()}><Search className="w-4 h-4" />Ask</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((s, i) => (
          <button key={s} type="button" className={`${btnSm} hud-row-in`} style={{ animationDelay: `${i * 30}ms` }} disabled={asking || !brief} onClick={() => ask(s)}>{s}</button>
        ))}
      </div>
      {loading && <Thinking text="Reading the project…" />}
      {asking && <Thinking text="Looking through the records…" />}
      <ErrorLine text={error} />
      {!answers.length && !asking ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          {projectId ? 'Answers come from the project\'s payments, decisions, minutes and follow-ups. Costs and margins are not part of it.' : 'Choose a project to ask about.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {answers.map(({ q, a }, i) => (
            <div key={`${i}:${q}`} className="rounded-xl border border-slate-200 p-4 hud-row-in">
              <p className={sub}>{q}</p>
              <p className="text-sm text-slate-800 mt-1.5 whitespace-pre-line">{a.answer}</p>
              {a.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {a.sources.map((s) => <span key={s} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">{s}</span>)}
                </div>
              )}
              {a.reply && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-start gap-2">
                  <p className="text-[13px] text-slate-700 flex-1 min-w-[200px] whitespace-pre-line">{a.reply}</p>
                  <button type="button" className={btnSm} onClick={() => copy(a.reply, i)}>
                    {copied === i ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}{copied === i ? 'Copied' : 'Copy reply'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Meeting prep ─────────────────────────────────────────────────────────── */

/* The meeting prep's bordered cards and their lines (DESIGN.md: rows, the state light). */
const Card: React.FC<{ title: string; empty: string; children?: React.ReactNode; n?: number }> = ({ title, empty, children, n = 0 }) => (
  <div className="rounded-xl border border-slate-200 p-4 hud-row-in" style={{ animationDelay: `${n * 30}ms` }}>
    <p className={sub}>{title}</p>
    <div className="mt-2">{children || <p className="text-xs text-slate-500">{empty}</p>}</div>
  </div>
);
const Lines: React.FC<{ items: { text: string; meta?: string | null; tone?: 'bad' | 'warn' | 'ok' }[] }> = ({ items }) => (
  <ul className="flex flex-col gap-1.5">
    {items.map((x, i) => (
      <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
        <span className="pt-1.5"><Dot tone={x.tone || 'ok'} /></span>
        <span className="min-w-0">{x.text}{x.meta ? <span className="text-xs text-slate-500"> · {x.meta}</span> : null}</span>
      </li>
    ))}
  </ul>
);

export function MeetingPrepPanel({ projects, rawProjects, waiting, tenantId, canWrite, onStartMinutes }: {
  projects: DeskProject[];
  rawProjects: any[];
  waiting: WaitingItem[];
  tenantId: string;
  canWrite: boolean;
  onStartMinutes: (projectId: string, notes: string) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const raw = rawProjects.find((p) => String(p?.id) === projectId) || null;
  const { brief, loading } = useBrief(tenantId, raw, waiting);
  const prep = useMemo(() => (brief ? meetingPrep(brief) : null), [brief]);
  const [when, setWhen] = useState(dayKey(Date.now()));
  const [notes, setNotes] = useState<{ watchOuts: string[]; agenda: string[] } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNotes(null);
    setError(null);
    if (!brief) return;
    let live = true;
    setThinking(true);
    prepNotes(brief)
      .then((n) => live && setNotes(n))
      .catch((e) => live && setError(`${errorText(e)} The suggested agenda below is still ready.`))
      .finally(() => live && setThinking(false));
    return () => { live = false; };
  }, [brief]);

  const agenda = notes?.agenda.length ? notes.agenda : prep?.agenda || [];
  const text = brief ? agendaText(brief.name, agenda, fmtDay(when)) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setError('Copying is blocked here. Select the agenda and copy it yourself.'); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-[260px_170px] gap-3">
        <ProjectPick id="prep-project" projects={projects} value={projectId} onChange={setProjectId} label="Meeting about" />
        <div>
          <Label htmlFor="prep-when">On</Label>
          <input id="prep-when" type="date" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
      </div>

      {!projectId ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">Choose a project to prepare for.</p>
      ) : loading || !prep || !brief ? <Thinking text="Reading the project…" /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card n={0} title="We owe them" empty="Nothing open on our side from the minutes.">
              {prep.ours.length ? <Lines items={prep.ours.map((a) => ({ text: a.text, meta: [a.ownerName, a.due ? `by ${fmtDay(a.due)}` : null, a.from].filter(Boolean).join(' · '), tone: a.due && a.due < dayKey(Date.now()) ? 'bad' : 'ok' }))} /> : null}
            </Card>
            <Card n={1} title="They owe us" empty="Nothing open on the client's side.">
              {prep.theirs.length || prep.waiting.length ? <Lines items={[
                ...prep.waiting.map((w) => ({ text: `${w.kind === 'payment' ? 'Payment' : 'Decision'}: ${w.label}`, meta: `waiting ${w.days} days${w.slipDays ? ` · can hold handover ~${w.slipDays} days` : ''}`, tone: (w.overdueDays || w.days >= 7 ? 'bad' : w.days >= 3 ? 'warn' : 'ok') as 'bad' | 'warn' | 'ok' })),
                ...prep.theirs.map((a) => ({ text: a.text, meta: a.from })),
              ]} /> : null}
            </Card>
            <Card n={2} title="Money" empty="No payment schedule on this project.">
              {brief.money ? (
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] text-slate-700">Paid <b className="font-bold text-slate-800 tabular-nums">{inr(brief.money.totalPaid)}</b> of {inr(brief.money.projectValue)} · {inr(brief.money.balanceDue)} still to come</p>
                  {prep.moneyLine && <p className="text-xs text-slate-500">{prep.moneyLine}</p>}
                </div>
              ) : null}
            </Card>
            <Card n={3} title="Last time" empty="No shared minutes yet.">
              {prep.lastMeeting ? (
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] font-semibold text-slate-800">{prep.lastMeeting.title}{prep.lastMeeting.date ? ` · ${fmtDay(prep.lastMeeting.date)}` : ''}{prep.lastMeeting.ref ? <span className="font-mono text-xs font-normal text-slate-400"> · {prep.lastMeeting.ref}</span> : null}</p>
                  {prep.lastMeeting.summary && <p className="text-xs text-slate-500">{prep.lastMeeting.summary}</p>}
                </div>
              ) : null}
            </Card>
          </div>

          {(prep.recent.length > 0 || prep.escalations.length > 0) && (
            <Card n={4} title="Since then" empty="">
              <Lines items={[
                ...prep.escalations.map((e) => ({ text: `Escalation: ${e.title}`, meta: e.decision ? `Lead decided: ${e.decision}` : 'waiting for a lead', tone: (e.status === 'open' ? 'bad' : 'ok') as 'bad' | 'ok' })),
                ...prep.recent.map((f) => ({ text: f.note || f.outcome, meta: `${f.by} · ${fmtDay(f.when)}` })),
              ]} />
            </Card>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><CalendarClock className="w-3.5 h-3.5" /></span>
              <span className="text-sm font-bold text-slate-800">Agenda</span>
              <span className="text-[11px] text-slate-500">{notes?.agenda.length ? 'Suggested by the AI from the records' : 'From the records'}</span>
            </div>
            {thinking && <Thinking text="Looking for what to watch out for…" />}
            {notes?.watchOuts.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 hud-row-in">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Keep in mind</p>
                <ul className="mt-1 flex flex-col gap-1">{notes.watchOuts.map((w, i) => <li key={i} className="text-xs text-amber-900">{w}</li>)}</ul>
              </div>
            ) : null}
            <ol className="flex flex-col gap-1.5">
              {agenda.map((a, i) => (
                <li key={`${i}:${a}`} className="flex items-start gap-3 text-[13px] text-slate-700 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <span className="w-5 h-5 shrink-0 rounded-md bg-white border border-slate-200 text-[10px] font-black text-slate-600 grid place-items-center tabular-nums">{i + 1}</span>
                  <span className="min-w-0">{a}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnSec} onClick={copy}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy agenda'}</button>
              {canWrite && <button type="button" className={btnPri} onClick={() => onStartMinutes(projectId, text)}><NotebookPen className="w-4 h-4" />Start the minutes from it</button>}
              <span className="text-[11px] text-slate-500">Send it to the client the day before, or open the minutes with it in the meeting.</span>
            </div>
          </div>
          <ErrorLine text={error} />
        </>
      )}
    </div>
  );
}
