import React, { useMemo, useState } from 'react';
import '../projectHeader/projectHeader.css';
import { X, Copy, Check, Send, Flag, MessageCircle } from '@/lib/lucide-shim';
import {
  CHANNELS, OUTCOMES, ESCALATION_CATEGORIES, draftMessage, addDays, dayKey, inr,
  type Channel, type Outcome, type Tone, type WaitingItem, type Subject, type EscalationCategory, type Escalation,
} from '../../lib/opsDesk';
import { logFollowUp, raiseEscalation, decideEscalation } from '../../services/opsDeskService';
import { handoverSlip } from '../../lib/opsAssist';

export interface DeskProject { id: string; name: string; clientName: string; targetHandover?: string | null; clientEmail?: string }
export interface Person { email: string; name: string }

/* ── The app's modal and controls (DESIGN.md) ──────────────────────────── */

export const Sheet: React.FC<{ eyebrow: string; title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> =
  ({ eyebrow, title, sub, onClose, children, footer }) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label={title}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{eyebrow}</p>
            <h3 className="font-bold text-slate-800 mt-1">{title}</h3>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">{children}</div>
        {footer && <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );

export const Label: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{children}</label>
);
export const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
export const btnPri = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] transition-colors disabled:opacity-50';
export const btnSec = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
export const btnSm = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';

export const Seg: React.FC<{ value: string; options: { id: string; label: string }[]; onChange: (v: any) => void; label: string }> = ({ value, options, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
    {options.map((o) => (
      <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
        className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${value === o.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{o.label}</button>
    ))}
  </div>
);

/* ── Log a follow-up, with a message to copy ───────────────────────────── */

export interface LogPrefill { projectId?: string; subjectKey?: string; nextDue?: string; channel?: Channel; outcome?: Outcome }

export function LogFollowUpPanel({ projects, waiting, team, me, tenantId, studioName, prefill, onClose, onSaved }: {
  projects: DeskProject[];
  waiting: WaitingItem[];
  team: Person[];
  me: Person;
  tenantId: string;
  studioName: string;
  prefill?: LogPrefill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(prefill?.projectId || projects[0]?.id || '');
  const project = projects.find((p) => p.id === projectId);
  const options = waiting.filter((w) => w.projectId === projectId);
  const [subjectKey, setSubjectKey] = useState(prefill?.subjectKey || '');
  const item = options.find((w) => w.key === subjectKey) || null;
  const kind = item?.kind || 'general';

  const [tone, setTone] = useState<Tone>(item && item.reminders >= 1 ? 'clear' : 'gentle');
  const [topic, setTopic] = useState('');
  /* How long the wait can hold handover up, said in the firmer tones (lib/opsAssist). */
  const slip = item ? handoverSlip(item, project?.targetHandover) : null;
  const draft = useMemo(() => draftMessage(kind, tone, {
    clientName: project?.clientName || '', projectName: project?.name || '', label: item?.label || topic || 'a quick update',
    amount: item?.amount, dueKey: item?.dueKey, days: item?.days, senderName: me.name, studioName,
    slipDays: slip?.days, newHandoverKey: slip?.newHandoverKey,
  }), [kind, tone, project?.clientName, project?.name, item, topic, me.name, studioName, slip?.days, slip?.newHandoverKey]);
  const [message, setMessage] = useState<string | null>(null);
  const shown = message ?? draft;
  const [copied, setCopied] = useState(false);

  const [channel, setChannel] = useState<Channel>(prefill?.channel || 'whatsapp');
  const [outcome, setOutcome] = useState<Outcome>(prefill?.outcome || (item ? 'reminded' : 'info'));
  const [note, setNote] = useState('');
  const [nextText, setNextText] = useState('');
  const [nextOwner, setNextOwner] = useState(me.email);
  const [nextDue, setNextDue] = useState(prefill?.nextDue || addDays(dayKey(Date.now()), 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copying is blocked here. Select the message and copy it yourself.');
    }
  };

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const subject: Subject | null = item ? { kind: item.kind, key: item.key, label: item.label } : null;
      const owner = team.find((t) => t.email === nextOwner) || me;
      await logFollowUp({
        tenantId, projectId: project.id, projectName: project.name, me, channel, outcome,
        note: note.trim() || (copied ? `Sent: ${shown.split('\n').find((l) => l.trim() && !/^hi\b/i.test(l.trim())) || 'reminder'}`.slice(0, 300) : ''),
        subject,
        next: nextText.trim() ? { text: nextText.trim().slice(0, 300), ownerEmail: owner.email, ownerName: owner.name, due: nextDue } : null,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'You cannot log on this project. Ask a lead to assign it to you.' : 'That was not saved. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet eyebrow="Follow-up log" title="Log a follow-up" sub="Every call, WhatsApp and email, with the next step and its date. Marked as logged by hand." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} onClick={save} disabled={saving || !project || (!note.trim() && !copied && !nextText.trim())}>
          <Check className="w-4 h-4" />{saving ? 'Saving…' : 'Save to the log'}
        </button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fu-project">Project</Label>
          <select id="fu-project" className={input} value={projectId} onChange={(e) => { setProjectId(e.target.value); setSubjectKey(''); setMessage(null); }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="fu-subject">About</Label>
          <select id="fu-subject" className={input} value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); setMessage(null); setOutcome(e.target.value ? 'reminded' : 'info'); }}>
            <option value="">Something else</option>
            {options.map((w) => <option key={w.key} value={w.key}>{w.kind === 'payment' ? 'Payment' : 'Decision'}: {w.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><MessageCircle className="w-3.5 h-3.5" /></span>
          <span className="text-sm font-bold text-slate-800">Message to send</span>
          {item?.kind === 'payment' && item.amount != null && item.amount > 0 ? <span className="text-xs text-slate-500">{inr(item.amount)} · due {item.dueKey}</span> : null}
          <span className="ml-auto"><Seg label="Tone" value={tone} onChange={(t) => { setTone(t); setMessage(null); }}
            options={[{ id: 'gentle', label: 'Gentle' }, { id: 'clear', label: 'Clear' }, { id: 'firm', label: 'Firm' }]} /></span>
        </div>
        {!item && (
          <input aria-label="What the message is about" className={input} placeholder="What is it about? e.g. the wardrobe shutter dates" value={topic} onChange={(e) => { setTopic(e.target.value); setMessage(null); }} />
        )}
        <textarea aria-label="Message" className={`${input} min-h-[150px] leading-relaxed`} value={shown} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSec} onClick={copy}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy message'}</button>
          <span className="text-[11px] text-slate-500">Paste it into WhatsApp or your email, then save it here.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-3">
        <div>
          <Label>How</Label>
          <Seg label="Channel" value={channel} onChange={setChannel} options={CHANNELS.map((c) => ({ id: c.id, label: c.label }))} />
        </div>
        <div>
          <Label htmlFor="fu-outcome">What came of it</Label>
          <select id="fu-outcome" className={input} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="fu-note">What was said</Label>
        <textarea id="fu-note" className={`${input} min-h-[70px]`} maxLength={2000} placeholder={copied ? 'Optional: the message you copied is noted' : 'e.g. Spoke to Nikhil, he will transfer by Wednesday'} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-800 mb-2">Next step <span className="text-xs font-semibold text-slate-500">puts it on someone's Ops Desk</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_150px] gap-2">
          <input aria-label="Next step" className={input} placeholder="e.g. Call again if no reply" value={nextText} onChange={(e) => setNextText(e.target.value)} />
          <select aria-label="Who" className={input} value={nextOwner} onChange={(e) => setNextOwner(e.target.value)}>
            {[me, ...team.filter((t) => t.email !== me.email)].map((t) => <option key={t.email} value={t.email}>{t.email === me.email ? `Me (${t.name})` : t.name}</option>)}
          </select>
          <input aria-label="By when" type="date" className={input} value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
    </Sheet>
  );
}

/* ── Raise an escalation ───────────────────────────────────────────────── */

export function RaiseEscalationPanel({ projects, waiting, me, tenantId, prefill, onClose, onSaved }: {
  projects: DeskProject[]; waiting: WaitingItem[]; me: Person; tenantId: string; prefill?: LogPrefill; onClose: () => void; onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(prefill?.projectId || projects[0]?.id || '');
  const options = waiting.filter((w) => w.projectId === projectId);
  const [subjectKey, setSubjectKey] = useState(prefill?.subjectKey || '');
  const item = options.find((w) => w.key === subjectKey);
  const [category, setCategory] = useState<EscalationCategory>(item?.kind === 'payment' ? 'payment' : 'other');
  const [title, setTitle] = useState(item ? `${item.kind === 'payment' ? 'Payment' : 'Decision'} stuck: ${item.label}` : '');
  const [detail, setDetail] = useState(item ? `Waiting ${item.days} days${item.reminders ? `, ${item.reminders} reminder${item.reminders === 1 ? '' : 's'} sent` : ''}.` : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId);

  const save = async () => {
    if (!project || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await raiseEscalation({ tenantId, projectId: project.id, projectName: project.name, me, title: title.trim(), detail: detail.trim(), category, subjectKey: item?.key || null });
      onSaved();
    } catch {
      setError('That was not raised. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet eyebrow="Escalation" title="Raise an escalation" sub="It goes to the studio's leads by email, and their decision comes back to your Ops Desk." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} onClick={save} disabled={saving || !title.trim() || !project}><Flag className="w-4 h-4" />{saving ? 'Raising…' : 'Raise it'}</button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="es-project">Project</Label>
          <select id="es-project" className={input} value={projectId} onChange={(e) => { setProjectId(e.target.value); setSubjectKey(''); }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="es-cat">Kind</Label>
          <select id="es-cat" className={input} value={category} onChange={(e) => setCategory(e.target.value as EscalationCategory)}>
            {ESCALATION_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>
      {options.length > 0 && (
        <div>
          <Label htmlFor="es-subject">About (optional)</Label>
          <select id="es-subject" className={input} value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
            <option value="">Nothing in particular</option>
            {options.map((w) => <option key={w.key} value={w.key}>{w.kind === 'payment' ? 'Payment' : 'Decision'}: {w.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <Label htmlFor="es-title">In one line</Label>
        <input id="es-title" className={input} maxLength={200} placeholder="e.g. Client wants completion 10 days earlier" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="es-detail">What happened, and what you need decided</Label>
        <textarea id="es-detail" className={`${input} min-h-[110px]`} maxLength={2000} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
    </Sheet>
  );
}

/* ── A lead decides ────────────────────────────────────────────────────── */

export function DecideEscalationPanel({ escalation, me, onClose, onSaved }: { escalation: Escalation; me: Person; onClose: () => void; onSaved: () => void }) {
  const [decision, setDecision] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await decideEscalation(escalation.projectId, escalation.id, decision.trim(), me);
      onSaved();
    } catch {
      setError('That was not saved. Only an Owner, Admin or Ops Director can decide an escalation.');
      setSaving(false);
    }
  };
  return (
    <Sheet eyebrow="Escalation" title={`Decide: ${escalation.title}`} sub={`${escalation.projectName} · ${escalation.auto ? 'raised by the daily check' : `raised by ${escalation.raisedByName || escalation.raisedBy}`}`} onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} onClick={save} disabled={saving || !decision.trim()}><Send className="w-4 h-4" />{saving ? 'Sending…' : 'Send the decision back'}</button>
      </>}>
      {escalation.detail && <p className="text-[13px] text-slate-700 whitespace-pre-line bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">{escalation.detail}</p>}
      <div>
        <Label htmlFor="dec-text">Your decision, in words the executive can pass on</Label>
        <textarea id="dec-text" className={`${input} min-h-[120px]`} maxLength={2000} placeholder="e.g. Tell her we will send a revised quote by Friday; no price on the phone." value={decision} onChange={(e) => setDecision(e.target.value)} />
      </div>
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
    </Sheet>
  );
}
