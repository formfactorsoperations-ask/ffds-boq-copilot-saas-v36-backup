import React, { useEffect, useMemo, useState } from 'react';
import '../projectHeader/projectHeader.css';
import { Check, Copy, Plus, CalendarCheck, Star, Gift, Users, MapPin, Ruler, MessageCircle } from '@/lib/lucide-shim';
import { dayKey } from '../../lib/opsDesk';
import {
  BAND_LABEL, CHECKLIST_META, STATE_LABEL, VISIT_KINDS, VISIT_MODES, VISIT_STATUS_LABEL, ASK_SUBJECT, DOCS_SUBJECT,
  materialise, progressOf, setItem, addItem, checklistHints, documentsMessage, moveVisit, visitMessage, visitLabel, slotText, askMessage,
  type AskKind, type AskPrompt, type Checklist, type ChecklistKind, type ItemState, type Pulse, type PulseBand,
  type Slot, type VisitKind, type VisitMode, type VisitRequest, type VisitStatus,
} from '../../lib/clientCare';
import type { ClientMoney } from '../../lib/clientMoney';
import { createVisit, logFollowUp, saveChecklist, updateVisit } from '../../services/opsDeskService';
import { Sheet, Label, Seg, input, btnPri, btnSec, btnSm, type DeskProject, type Person } from './OpsDeskPanels';
import { CountUp, Dot } from '../ui/HudBits';

/*
  CLIENT CARE ON THE OPS DESK (lib/clientCare.ts): the client pulse, the
  onboarding, documents and handover checklists, meeting and site visit
  requests, and the review and referral asks. Built to DESIGN.md.
*/

const sub = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';
const BAND_TONE: Record<PulseBand, 'ok' | 'warn' | 'bad'> = { good: 'ok', watch: 'warn', at_risk: 'bad' };
const BAND_TINT: Record<PulseBand, string> = { good: 'bg-emerald-100 text-emerald-700', watch: 'bg-amber-100 text-amber-700', at_risk: 'bg-rose-100 text-rose-700' };
const fmtWhen = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const saveError = (e: any) => (e?.code === 'permission-denied' ? 'That is not yours to change on this project.' : 'That was not saved. Check your connection and try again.');

const ErrorLine: React.FC<{ text: string | null }> = ({ text }) => (text ? <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{text}</p> : null);
const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">{text}</p>
);

function useCopy(onError: (m: string) => void) {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { onError('Copying is blocked here. Select the message and copy it yourself.'); }
  };
  return { copied, copy };
}

/* ── The client pulse ─────────────────────────────────────────────────────── */

export interface PulseRow { project: DeskProject; pulse: Pulse; prompts: AskPrompt[] }

export function PulseList({ rows, onAsk, onOpenProject }: { rows: PulseRow[]; onAsk: (projectId: string, kind: AskKind) => void; onOpenProject: (projectId: string) => void }) {
  const sorted = [...rows].sort((a, b) => a.pulse.score - b.pulse.score);
  const count = (b: PulseBand) => rows.filter((r) => r.pulse.band === b).length;
  if (!rows.length) return <Empty text="No projects to read yet." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {(['at_risk', 'watch', 'good'] as PulseBand[]).map((b) => (
          <span key={b} className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Dot tone={BAND_TONE[b]} />{BAND_LABEL[b]}
            <span className="font-black text-slate-800 tabular-nums"><CountUp value={count(b)} /></span></span>
        ))}
        <span className="text-[11px] text-slate-500 ml-auto">Starts at 80 and moves with payments, decisions, replies, mood and escalations.</span>
      </div>
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {sorted.map(({ project: p, pulse, prompts }, i) => (
          <div key={p.id} className="flex flex-wrap items-start gap-3 px-3 py-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
            <span className={`w-11 h-11 shrink-0 rounded-xl grid place-items-center text-sm font-black tabular-nums ${BAND_TINT[pulse.band]}`} title={`${BAND_LABEL[pulse.band]}: ${pulse.score} of 100`}>
              <CountUp value={pulse.score} />
            </span>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpenProject(p.id)} className="text-left">
                <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                {p.clientName && <span className="text-xs text-slate-500"> · {p.clientName}</span>}
              </button>
              <p className="text-[11px] text-slate-500">
                {BAND_LABEL[pulse.band]}{pulse.lastHeardAt ? ` · last heard from ${fmtWhen(pulse.lastHeardAt)}` : ' · no reply logged yet'}
                {pulse.confidence === 'low' ? ' · early read: few follow-ups logged' : pulse.confidence === 'medium' ? ' · fair read' : ''}
              </p>
              {pulse.reasons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pulse.reasons.map((r) => (
                    <span key={r.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.points < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      <span className="font-black tabular-nums">{r.points > 0 ? `+${r.points}` : r.points}</span>{r.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {prompts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {prompts.map((a) => (
                  <button key={a.kind} type="button" className={btnSm} onClick={() => onAsk(p.id, a.kind)} title={a.reason}>
                    {a.kind === 'review' ? <Star className="w-3.5 h-3.5" /> : <Gift className="w-3.5 h-3.5" />}{a.kind === 'review' ? 'Ask for a review' : 'Ask for a referral'}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Asking for a review or a referral ───────────────────────────────────── */

export function AskSheet({ project, kind, reason, me, tenantId, studioName, reviewLink, onClose, onSaved }: {
  project: DeskProject; kind: AskKind; reason: string; me: Person; tenantId: string; studioName: string; reviewLink: string;
  onClose: () => void; onSaved: () => void;
}) {
  const draft = useMemo(() => askMessage(kind, { clientName: project.clientName, projectName: project.name, senderName: me.name, studioName, reviewLink }), [kind, project, me.name, studioName, reviewLink]);
  const [text, setText] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { copied, copy } = useCopy(setError);
  const log = async (outcome: 'reminded' | 'replied') => {
    setSaving(true);
    setError(null);
    try {
      await logFollowUp({
        tenantId, projectId: project.id, projectName: project.name, me, channel: 'whatsapp', outcome,
        note: outcome === 'reminded' ? `Asked for a ${kind === 'review' ? 'Google review' : 'referral'}. ${reason}.` : kind === 'review' ? 'They posted a Google review.' : 'They passed on a referral.',
        subject: { kind: 'general', ...ASK_SUBJECT[kind] }, next: null,
      });
      onSaved();
    } catch (e: any) {
      setError(saveError(e));
      setSaving(false);
    }
  };
  return (
    <Sheet eyebrow="Client care" title={kind === 'review' ? 'Ask for a Google review' : 'Ask for a referral'} sub={`${project.name} · ${reason}. Asked at most twice, a month apart.`} onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={() => log('replied')} disabled={saving}>{kind === 'review' ? 'They posted one' : 'They referred someone'}</button>
        <button type="button" className={btnPri} onClick={() => log('reminded')} disabled={saving}><Check className="w-4 h-4" />{saving ? 'Saving…' : 'Mark as asked'}</button>
      </>}>
      {kind === 'review' && !reviewLink && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No review link yet. A lead can add the studio's Google review link in Studio settings → Ops Desk.</p>
      )}
      <textarea aria-label="Message" className={`${input} min-h-[200px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnSec} onClick={() => copy(text)}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy message'}</button>
        <span className="text-[11px] text-slate-500">Send it on WhatsApp, then mark it as asked so it is not asked again too soon.</span>
      </div>
      <ErrorLine text={error} />
    </Sheet>
  );
}

/* ── Checklists ───────────────────────────────────────────────────────────── */

export function ChecklistsView({ projects, care, money, focus, onFocus, me, isLead, canWrite, tenantId, studioName, onChanged }: {
  projects: DeskProject[];
  care: Record<string, Partial<Record<ChecklistKind, Checklist>>>;
  money: Record<string, ClientMoney | null>;
  focus: { projectId: string; kind: ChecklistKind };
  onFocus: (f: { projectId: string; kind: ChecklistKind }) => void;
  me: Person; isLead: boolean; canWrite: boolean; tenantId: string; studioName: string;
  onChanged: () => void;
}) {
  const project = projects.find((p) => p.id === focus.projectId) || projects[0];
  const kind = focus.kind;
  const saved = project ? care[project.id]?.[kind] : undefined;
  const [list, setList] = useState<Checklist>(() => saved || materialise(kind, null));
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy(setError);
  useEffect(() => { setList(saved || materialise(kind, null)); setError(null); }, [saved, kind, project?.id]);

  if (!project) return <Empty text="No projects on your desk yet." />;
  const hints = checklistHints(kind, money[project.id] || null);
  const pr = progressOf(list);
  const locked = !!list.completedAt && !isLead;
  const editable = canWrite && !locked;

  const commit = async (next: Checklist) => {
    const before = list;
    setList(next);
    setBusy(true);
    setError(null);
    try { await saveChecklist(tenantId, project, next, me); onChanged(); } catch (e: any) { setList(before); setError(saveError(e)); } finally { setBusy(false); }
  };
  const move = (id: string, state: ItemState) => commit(setItem(list, id, { state }, me, Date.now()));
  const complete = (done: boolean) => commit({ ...list, completedAt: done ? Date.now() : null, completedBy: done ? me.email.toLowerCase() : null, completedByName: done ? me.name : null });

  const askForDocs = async () => {
    const now = Date.now();
    let next = list;
    for (const x of list.items) if (x.state === 'missing') next = setItem(next, x.id, { state: 'requested' }, me, now);
    await copy(documentsMessage(list, { clientName: project.clientName, projectName: project.name, senderName: me.name, studioName }));
    try {
      await logFollowUp({ tenantId, projectId: project.id, projectName: project.name, me, channel: 'whatsapp', outcome: 'reminded',
        note: `Asked for documents: ${list.items.filter((x) => x.state === 'missing' || x.state === 'requested').map((x) => x.label).join('; ')}`.slice(0, 2000),
        subject: { kind: 'general', ...DOCS_SUBJECT }, next: null });
    } catch (e: any) { setError(saveError(e)); return; }
    if (next !== list) await commit(next);
    else onChanged();
  };

  const states = CHECKLIST_META[kind].states;
  const docs = kind === 'documents';
  const pending = list.items.filter((x) => x.state === 'missing' || x.state === 'requested').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-[260px]">
          <Label htmlFor="cl-project">Project</Label>
          <select id="cl-project" className={input} value={project.id} onChange={(e) => onFocus({ projectId: e.target.value, kind })}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.clientName ? ` · ${p.clientName}` : ''}</option>)}
          </select>
        </div>
        <Seg label="Checklist" value={kind} onChange={(k) => onFocus({ projectId: project.id, kind: k })}
          options={(['onboarding', 'documents', 'handover'] as ChecklistKind[]).map((k) => ({ id: k, label: CHECKLIST_META[k].label }))} />
        {busy && <span className="flex items-center gap-2 text-xs text-slate-500"><Dot tone="warn" live />Saving…</span>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">{CHECKLIST_META[kind].label} · <span className="tabular-nums"><CountUp value={pr.done} /> of {pr.total}</span> {docs ? 'received' : 'done'}</p>
          <p className="text-xs text-slate-500">{CHECKLIST_META[kind].blurb}</p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-[#3D52A0] transition-all" style={{ width: `${pr.total ? Math.round((pr.done / pr.total) * 100) : 0}%` }} /></div>
        </div>
        {list.completedAt ? (
          <span className={`${chip} bg-emerald-100 text-emerald-700`}>Complete · {list.completedByName} · {fmtWhen(list.completedAt)}</span>
        ) : pr.settled && !docs ? (
          isLead ? <button type="button" className={btnPri} disabled={busy} onClick={() => complete(true)}><Check className="w-4 h-4" />Mark complete</button>
            : <span className={`${chip} bg-[#3D52A0]/10 text-[#3D52A0]`}>Ready for a lead to mark complete</span>
        ) : null}
        {list.completedAt && isLead && <button type="button" className={btnSm} disabled={busy} onClick={() => complete(false)}>Reopen</button>}
        {docs && pending > 0 && editable && (
          <button type="button" className={btnSec} disabled={busy} onClick={askForDocs}>
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <MessageCircle className="w-4 h-4" />}{copied ? 'Copied, marked as asked' : `Copy the ask for ${pending}`}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {list.items.map((x, i) => {
          const on = x.state === 'done' || x.state === 'received';
          return (
            <div key={x.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 hud-row-in ${x.state === 'na' ? 'opacity-60' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              {docs ? (
                <Dot tone={x.state === 'received' || x.state === 'na' ? 'ok' : x.state === 'requested' ? 'warn' : 'bad'} />
              ) : (
                <input type="checkbox" aria-label={x.label} checked={on} disabled={!editable || busy || x.state === 'na'}
                  onChange={(e) => move(x.id, e.target.checked ? 'done' : 'open')} className="w-4 h-4 rounded border-slate-300 accent-[#3D52A0]" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${on ? 'text-slate-500' : 'text-slate-800'}`}>{x.label}</p>
                <p className="text-[11px] text-slate-500">
                  {x.at && x.byName ? `${STATE_LABEL[x.state]} · ${x.byName} · ${fmtWhen(x.at)}` : docs ? STATE_LABEL[x.state] : 'Not started'}
                  {hints[x.id] && !on ? <span className="text-slate-700"> · {hints[x.id]}</span> : null}
                </p>
              </div>
              {docs ? (
                <select aria-label={`State of ${x.label}`} disabled={!editable || busy} value={x.state} onChange={(e) => move(x.id, e.target.value as ItemState)}
                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 disabled:bg-slate-50">
                  {states.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
                </select>
              ) : editable && (
                <button type="button" className={btnSm} disabled={busy} onClick={() => move(x.id, x.state === 'na' ? 'open' : 'na')}>{x.state === 'na' ? 'Needed after all' : 'Not needed'}</button>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) { commit(addItem(list, newItem, me, Date.now())); setNewItem(''); } }}>
          <input aria-label="Add an item" className={input} maxLength={160} placeholder={docs ? 'Another document, e.g. Car parking allotment letter' : 'Another item for this project'} value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <button type="submit" className={btnSec} disabled={busy || !newItem.trim()}><Plus className="w-4 h-4" />Add</button>
        </form>
      )}
      {locked && <p className="text-[11px] text-slate-500">Marked complete by {list.completedByName}. Ask a lead to reopen it to change anything.</p>}
      <ErrorLine text={error} />
    </div>
  );
}

/* ── Meeting and site visit requests ─────────────────────────────────────── */

const VISIT_ICON: Record<VisitKind, React.ComponentType<any>> = { meeting: Users, site_visit: MapPin, measurement: Ruler };
const STATUS_TINT: Record<VisitStatus, string> = {
  requested: 'bg-amber-100 text-amber-700', rescheduled: 'bg-amber-100 text-amber-700', confirmed: 'bg-[#3D52A0]/10 text-[#3D52A0]',
  done: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-600',
};

export function VisitsView({ visits, projects, canWrite, onAct, now }: {
  visits: VisitRequest[]; projects: DeskProject[]; canWrite: boolean; now: number;
  onAct: (v: VisitRequest, to: VisitStatus) => void;
}) {
  const today = dayKey(now);
  const name = (id: string) => projects.find((p) => p.id === id)?.name || '';
  const groups: { label: string; tone: 'bad' | 'warn' | 'ok'; list: VisitRequest[] }[] = [
    { label: 'Needs a time', tone: 'warn', list: visits.filter((v) => v.status === 'requested' || v.status === 'rescheduled') },
    { label: 'Coming up', tone: 'ok', list: visits.filter((v) => v.status === 'confirmed' && v.slot && v.slot.date >= today).sort((a, b) => `${a.slot!.date}${a.slot!.time}`.localeCompare(`${b.slot!.date}${b.slot!.time}`)) },
    { label: 'Past, to close out', tone: 'bad', list: visits.filter((v) => v.status === 'confirmed' && v.slot && v.slot.date < today) },
    { label: 'Done and cancelled, last 30 days', tone: 'ok', list: visits.filter((v) => (v.status === 'done' || v.status === 'cancelled') && now - (v.updatedAt || 0) < 30 * 86400000).sort((a, b) => b.updatedAt - a.updatedAt) },
  ];
  if (!visits.length) return <Empty text="No meeting or visit requests yet. Log one when a client asks, or when you need to see them." />;
  return (
    <div className="space-y-5">
      {groups.filter((g) => g.list.length).map((g) => (
        <div key={g.label}>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2"><Dot tone={g.tone} />{g.label}</p>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {g.list.map((v, i) => {
              const Icon = VISIT_ICON[v.kind] || CalendarCheck;
              const open = v.status !== 'done' && v.status !== 'cancelled';
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><Icon className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{visitLabel(v.kind)}{v.purpose ? `: ${v.purpose}` : ''}</p>
                    <p className="text-xs text-slate-500"><b className="font-semibold text-slate-700">{v.projectName || name(v.projectId)}</b> · {slotText(v.slot)} · {VISIT_MODES.find((m) => m.id === v.mode)?.label}
                      {v.reschedules ? ` · moved ${v.reschedules} time${v.reschedules === 1 ? '' : 's'}` : ''}</p>
                    <p className="text-[11px] text-slate-500">Asked for by the {v.requestedBy} · logged by {v.createdByName} · {fmtWhen(v.createdAt)}</p>
                  </div>
                  <span className={`${chip} ${STATUS_TINT[v.status]}`}>{VISIT_STATUS_LABEL[v.status]}</span>
                  {open && canWrite && (
                    <div className="flex flex-wrap gap-2">
                      {(v.status === 'requested' || v.status === 'rescheduled') && <button type="button" className={btnSm} onClick={() => onAct(v, 'confirmed')}><Check className="w-3.5 h-3.5" />Confirm</button>}
                      {v.status === 'confirmed' && <button type="button" className={btnSm} onClick={() => onAct(v, 'done')}><Check className="w-3.5 h-3.5" />Done</button>}
                      {v.status !== 'requested' && <button type="button" className={btnSm} onClick={() => onAct(v, 'rescheduled')}>Reschedule</button>}
                      {v.status === 'confirmed' && v.slot && v.slot.date >= today && <button type="button" className={btnSm} onClick={() => onAct(v, 'confirmed')}>Message</button>}
                      <button type="button" className={btnSm} onClick={() => onAct(v, 'cancelled')}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Log a new request, or move one: confirm a time, put a new time to the client, mark it done or cancel it. */
export function VisitSheet({ projects, visit, to, prefillProjectId, me, tenantId, studioName, onClose, onSaved }: {
  projects: DeskProject[];
  visit: VisitRequest | null;
  to: VisitStatus | null;
  prefillProjectId?: string;
  me: Person; tenantId: string; studioName: string;
  onClose: () => void;
  onSaved: (v: { projectId: string; status: VisitStatus; notes: string }) => void;
}) {
  const creating = !visit;
  const [projectId, setProjectId] = useState(visit?.projectId || prefillProjectId || projects[0]?.id || '');
  const project = projects.find((p) => p.id === projectId);
  const [kind, setKind] = useState<VisitKind>(visit?.kind || 'site_visit');
  const [mode, setMode] = useState<VisitMode>(visit?.mode || 'in_person');
  const [purpose, setPurpose] = useState(visit?.purpose || '');
  const [requestedBy, setRequestedBy] = useState<'client' | 'studio'>(visit?.requestedBy || 'client');
  const [agreed, setAgreed] = useState(false);
  const [date, setDate] = useState(visit?.slot?.date || '');
  const [time, setTime] = useState(visit?.slot?.time || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy(setError);

  const target: VisitStatus = creating ? (agreed ? 'confirmed' : 'requested') : (to as VisitStatus);
  const slot: Slot | null = date && time ? { date, time } : null;
  const needsSlot = target === 'confirmed' || target === 'rescheduled';
  const msgKind = target === 'rescheduled' ? 'reschedule' : target === 'confirmed' ? 'confirm' : null;
  const message = msgKind && slot && project
    ? visitMessage(msgKind, { kind, mode, purpose, slot }, { clientName: project.clientName, projectName: project.name, senderName: me.name, studioName })
    : '';
  const sameSlot = !creating && to === 'confirmed' && visit?.status === 'confirmed';

  const title = creating ? 'Log a meeting or visit request'
    : sameSlot ? 'Message about this visit'
    : to === 'confirmed' ? 'Confirm the time' : to === 'rescheduled' ? 'Put a new time to the client' : to === 'done' ? 'Mark it done' : 'Cancel the request';

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    const now = Date.now();
    try {
      if (creating) {
        const ev = { at: now, by: me.email.toLowerCase(), byName: me.name, status: target, slot, note: note.trim().slice(0, 300) };
        await createVisit({
          tenantId, projectId: project.id, projectName: project.name, kind, mode, purpose: purpose.trim().slice(0, 300), requestedBy,
          status: target, slot, reschedules: 0, history: [ev], createdAt: now, createdBy: me.email.toLowerCase(), createdByName: me.name,
          updatedAt: now, updatedBy: me.email.toLowerCase(),
        });
      } else {
        const r = moveVisit(visit!, target, { slot: needsSlot ? slot : undefined, note }, me, now);
        if ('error' in r) { setError(r.error); setSaving(false); return; }
        await updateVisit(visit!.projectId, visit!.id, r.patch);
      }
      onSaved({ projectId: project.id, status: target, notes: `${visitLabel(kind)}${purpose ? `: ${purpose}` : ''}${slot ? `, ${slotText(slot)}` : ''}${note.trim() ? `\n\n${note.trim()}` : ''}` });
    } catch (e: any) {
      setError(saveError(e));
      setSaving(false);
    }
  };

  return (
    <Sheet eyebrow="Meetings & visits" title={title}
      sub={creating ? 'Requested by the client, or wanted by the studio. Confirm a time now if it is already agreed.' : `${visit!.projectName} · ${visitLabel(visit!.kind)}${visit!.purpose ? `: ${visit!.purpose}` : ''} · ${slotText(visit!.slot)}`}
      onClose={onClose}
      footer={sameSlot ? <button type="button" className={btnSec} onClick={onClose}>Close</button> : <>
        <button type="button" className={btnSec} onClick={onClose}>Back</button>
        <button type="button" className={btnPri} onClick={save} disabled={saving || !project || (needsSlot && !slot) || (creating && !purpose.trim())}>
          <Check className="w-4 h-4" />{saving ? 'Saving…' : creating ? 'Save the request' : to === 'cancelled' ? 'Cancel it' : to === 'done' ? 'Mark done' : to === 'rescheduled' ? 'Save the new time' : 'Confirm'}
        </button>
      </>}>
      {creating && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-project">Project</Label>
              <select id="v-project" className={input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Asked for by</Label>
              <Seg label="Asked for by" value={requestedBy} onChange={setRequestedBy} options={[{ id: 'client', label: 'The client' }, { id: 'studio', label: 'The studio' }]} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>What</Label><Seg label="What" value={kind} onChange={setKind} options={VISIT_KINDS} /></div>
            <div><Label>How</Label><Seg label="How" value={mode} onChange={setMode} options={VISIT_MODES} /></div>
          </div>
          <div>
            <Label htmlFor="v-purpose">For</Label>
            <input id="v-purpose" className={input} maxLength={300} placeholder="e.g. check the kitchen cut-outs before the stone is cut" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-[#3D52A0]" />
            The time is already agreed
          </label>
        </>
      )}
      {(creating || needsSlot) && !sameSlot && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="v-date">{creating && !agreed ? 'Preferred date (optional)' : 'Date'}</Label><input id="v-date" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label htmlFor="v-time">Time</Label><input id="v-time" type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
      )}
      {!sameSlot && (
        <div>
          <Label htmlFor="v-note">{to === 'cancelled' ? 'Why' : to === 'rescheduled' ? 'Why it moved' : 'Note'}</Label>
          <input id="v-note" className={input} maxLength={300} placeholder={to === 'done' ? 'Optional: anything to remember' : 'Optional'} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {(message || sameSlot) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3 hud-row-in">
          <p className="text-sm font-bold text-slate-800">Message to send</p>
          {sameSlot && visit?.slot ? (
            <MessagePair visit={visit} project={project} me={me} studioName={studioName} onError={setError} />
          ) : (
            <>
              <textarea aria-label="Message" readOnly className={`${input} min-h-[130px] leading-relaxed`} value={message} />
              <button type="button" className={`${btnSec} self-start`} onClick={() => copy(message)}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy message'}</button>
            </>
          )}
        </div>
      )}
      {to === 'done' && <p className="text-[11px] text-slate-500">Once it is marked done you can start the minutes from it.</p>}
      <ErrorLine text={error} />
    </Sheet>
  );
}

const MessagePair: React.FC<{ visit: VisitRequest; project?: DeskProject; me: Person; studioName: string; onError: (m: string) => void }> = ({ visit, project, me, studioName, onError }) => {
  const [which, setWhich] = useState<'confirm' | 'reminder'>('reminder');
  const text = visitMessage(which, visit, { clientName: project?.clientName || '', projectName: project?.name || visit.projectName, senderName: me.name, studioName });
  const { copied, copy } = useCopy(onError);
  return (
    <>
      <Seg label="Message" value={which} onChange={setWhich} options={[{ id: 'reminder', label: 'Day-before reminder' }, { id: 'confirm', label: 'Confirmation' }]} />
      <textarea aria-label="Message" readOnly className={`${input} min-h-[130px] leading-relaxed`} value={text} />
      <button type="button" className={`${btnSec} self-start`} onClick={() => copy(text)}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy message'}</button>
    </>
  );
};

export const askReasonOf = (prompts: AskPrompt[], kind: AskKind) => prompts.find((p) => p.kind === kind)?.reason || 'Client care';
