import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Inbox, Clock, IndianRupee, ListChecks, Flag, FileText, Phone, MessageCircle, Users, CalendarCheck, ClipboardCheck, FolderOpen, Star,
  UserPlus, Target, CircleHelp, Check, CalendarClock, ChevronDown, AlertTriangle, BookOpen, X,   Send,
} from '@/lib/lucide-shim';
import { Dot } from '../ui/HudBits';
import { Glide, IconTile, DoneTick, listV, rowV } from '../people/PeopleBits';
import { draftMessage, dayKey, addDays, type QueueItem, type QueueKind } from '../../lib/opsDesk';
import { explain, matchesWork, playbookOf, PLAYBOOK_OF, WORK_FILTERS, type WorkFilter, type DoneToday } from '../../lib/opsTeam';
import { handoverSlip } from '../../lib/opsAssist';
import { clock12 } from '../../lib/peopleDesk';
import { leadName } from '../../lib/leads';
import { btnPri, btnSec, btnSm } from './OpsDeskPanels';
import { useDesk, Panel, Chip, Empty, EYEBROW, BRAND_EYEBROW, fmtDay, fmtTime } from './DeskBits';
import '../projectHeader/projectHeader.css';

/*
  TODAY (mockups OD1 and OD2): the desk opens on what to do now. "Up next" is
  the one thing that costs most if it waits, with why, what to say and what
  happens if nobody answers. Below it, the day in order; a row opens in place
  to say why it is there, with the message ready to send, and its ? opens the
  playbook the leads wrote for that kind of work. Beside it: your clients,
  your week, and a tip.
*/

export const KIND: Record<QueueKind, { icon: React.ComponentType<any>; label: string }> = {
  next: { icon: ListChecks, label: 'Next step' },
  payment: { icon: IndianRupee, label: 'Payment' },
  decision: { icon: Clock, label: 'Waiting on client' },
  mom_review: { icon: FileText, label: 'Minutes' },
  escalation_open: { icon: Flag, label: 'Escalation' },
  escalation_decided: { icon: Flag, label: 'Decision back' },
  visit: { icon: CalendarCheck, label: 'Meeting or visit' },
  documents: { icon: FolderOpen, label: 'Documents' },
  checklist: { icon: ClipboardCheck, label: 'Checklist' },
  ask: { icon: Star, label: 'Client care' },
  lead: { icon: UserPlus, label: 'Leads' },
  lead_open: { icon: UserPlus, label: 'Lead to open' },
  digest: { icon: Send, label: 'Friday update' },
};
const GROUP_TONE = { overdue: 'bad', today: 'warn', week: 'ok', later: 'ok' } as const;
const GROUP_LABEL = { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later' } as const;

export const ACTION: Record<QueueKind, string> = {
  next: 'Done', payment: 'Remind', decision: 'Remind', mom_review: 'Review', escalation_open: 'Decide', escalation_decided: 'Open',
  visit: 'Confirm', documents: 'Chase', checklist: 'Open', ask: 'Ask', lead: 'Call', lead_open: 'Open', digest: 'Open',
};

/** The message for a payment or decision, in the tone its reminders call for. Amounts only for roles that see money. */
export function reminderText(d: ReturnType<typeof useDesk>, w: NonNullable<ReturnType<typeof useDesk>['waiting'][number]>, q?: QueueItem) {
  const project = d.projects.find((p) => p.id === w.projectId);
  const slip = handoverSlip(w, project?.targetHandover);
  return draftMessage(w.kind, w.reminders >= 1 ? 'clear' : 'gentle', {
    clientName: firstClientName(project?.clientName || ''), projectName: project?.name || w.projectName, label: w.label,
    amount: d.seesMoney ? w.amount : undefined, dueKey: w.dueKey, days: w.days, senderName: d.me.name, studioName: d.studioName,
    slipDays: slip.days, newHandoverKey: slip.newHandoverKey,
  });
}
const firstClientName = (n: string) => n.trim();

/* ── The list ────────────────────────────────────────────────────────────── */

export function TodayList({ queue, done, readOnly }: { queue: QueueItem[]; done: DoneToday[]; readOnly?: boolean }) {
  const [filter, setFilter] = useState<WorkFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [book, setBook] = useState<QueueKind | null>(null);
  const shown = queue.filter((q) => matchesWork(q, filter));
  const groups = (['overdue', 'today', 'week', 'later'] as const).map((g) => [g, shown.filter((q) => q.group === g)] as const).filter(([, l]) => l.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Glide id={readOnly ? 'work-ro' : 'work'} label="Kind of work" value={filter} onChange={setFilter} options={WORK_FILTERS} />
        <span className="text-[11px] text-slate-500 ml-auto">{shown.length} open{done.length ? ` · ${done.length} done today` : ''}</span>
      </div>
      {!shown.length && !done.length ? <Empty icon={Inbox} text={queue.length ? 'Nothing of this kind is open.' : 'Nothing needs you right now.'} /> : null}
      {groups.map(([g, list]) => (
        <div key={g}>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2"><Dot tone={GROUP_TONE[g]} />{GROUP_LABEL[g]}<span className="tabular-nums">· {list.length}</span></p>
          <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {list.map((q) => (
              <QueueRow key={q.id} q={q} group={g} open={openId === q.id} onToggle={() => setOpenId(openId === q.id ? null : q.id)} onHelp={() => setBook(q.kind)} readOnly={readOnly} />
            ))}
          </motion.div>
        </div>
      ))}
      {done.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2"><Dot tone="ok" />Done today<span className="tabular-nums">· {done.length}</span></p>
          <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {done.slice(0, 12).map((x) => (
              <motion.div key={x.id} variants={rowV} className="flex items-center gap-3 px-3 py-2.5 opacity-60">
                <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 grid place-items-center shrink-0"><Check className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate line-through">{x.title}</p>
                  <p className="text-xs text-slate-500 truncate"><b className="font-semibold text-slate-700">{x.project}</b> · {x.kind === 'logged' ? 'Follow-up' : 'Next step'} · {x.kind === 'logged' ? 'logged' : 'done'} {fmtTime(x.at)}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
      <AnimatePresence>{book && <PlaybookSheet kind={book} onClose={() => setBook(null)} />}</AnimatePresence>
    </div>
  );
}

const QueueRow: React.FC<{ q: QueueItem; group: string; open: boolean; onToggle: () => void; onHelp: () => void; readOnly?: boolean }> = ({ q, group, open, onToggle, onHelp, readOnly }) => {
  const d = useDesk();
  const k = KIND[q.kind];
  const Icon = k.icon;
  const fu = q.kind === 'next' ? d.followUps.find((f) => f.id === q.ref) : null;
  const w = q.kind === 'payment' || q.kind === 'decision' ? d.waiting.find((x) => x.projectId === q.projectId && x.key === q.ref) || null : null;
  const project = d.projects.find((p) => p.id === q.projectId);
  const slip = w ? handoverSlip(w, project?.targetHandover).days : 0;
  const lead = q.kind === 'lead' || q.kind === 'lead_open' ? d.leads.find((l) => l.id === q.ref) : null;
  const [ticking, setTicking] = useState(false);
  const minutes = q.kind === 'lead' && /^New lead/.test(q.title) && lead ? Math.round((d.now - lead.createdAt) / 60000) : null;
  const message = useMemo(() => (w ? reminderText(d, w, q) : ''), [w, d.seesMoney, d.me.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async () => {
    if (readOnly) return;
    if (fu) {
      setTicking(true);
      await d.act.markDone(fu);
      return;
    }
    if (q.kind === 'payment' || q.kind === 'decision') return d.act.log({ projectId: q.projectId, subjectKey: q.ref });
    d.act.openItem(q);
  };
  const e = open ? explain(q, { waiting: w, settings: d.settings, slipDays: slip }) : null;
  const clientName = project?.clientName || (lead ? leadName(lead) : '');

  return (
    <motion.div variants={rowV} className={`${open ? 'bg-[#3D52A0]/5' : ''} transition-colors`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="group shrink-0">{ticking ? <DoneTick size={32} /> : <IconTile icon={Icon} size="sm" />}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className={`block text-sm font-semibold text-slate-800 truncate ${ticking ? 'line-through opacity-50' : ''}`}>{q.title}</span>
          <span className="block text-xs text-slate-500 truncate">
            <b className="font-semibold text-slate-700">{q.projectName}</b> · {k.label} · {q.detail}
          </span>
        </button>
        {minutes != null && <span className="hidden sm:inline"><Chip tone={minutes >= 60 ? 'rose' : 'amber'}>{minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`}</Chip></span>}
        {q.due && group === 'overdue' && <span className="hidden sm:inline"><Chip tone="rose">Due {fmtDay(q.due)}</Chip></span>}
        {q.due && (group === 'week' || group === 'later') && <span className="hidden sm:inline"><Chip>{fmtDay(q.due)}</Chip></span>}
        {!readOnly && d.canWrite && <button type="button" className={btnSm} disabled={ticking} onClick={act}>{fu ? <Check className="w-3.5 h-3.5" /> : null}{q.kind === 'lead' && !/^New lead/.test(q.title) ? 'Open' : ACTION[q.kind]}</button>}
        <button type="button" onClick={onHelp} className="p-1 rounded-lg text-slate-300 hover:text-[#3D52A0] hover:bg-slate-100 transition-colors" aria-label={`How to handle: ${k.label}`} title="The playbook for this kind of work">
          <CircleHelp className="w-4 h-4" />
        </button>
        <button type="button" onClick={onToggle} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label={open ? 'Close' : 'Open'}>
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && e && (
          <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-[#3D52A0]/10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                {([[CircleHelp, 'Why it is here', e.why], [Target, 'What to do', e.todo], [AlertTriangle, 'If it waits', e.ifWaits]] as const).map(([I, t, v], i) => (
                  <motion.div key={t} initial={{ opacity: 0, y: 8, rotateX: -20 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.05 + i * 0.06 }}>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><I className="w-3.5 h-3.5 text-[#3D52A0]" />{t}</p>
                    <p className="text-xs text-slate-600 mt-1">{v}</p>
                  </motion.div>
                ))}
              </div>
              {w && !readOnly && d.canWrite && (
                <div className="mt-4">
                  <p className={`${EYEBROW} mb-1.5`}>Ready to send · WhatsApp to {clientName || 'the client'}</p>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-slate-700 leading-relaxed max-w-xl whitespace-pre-line">{message}</div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button type="button" className={`${btnPri} pp-press`} onClick={() => d.act.sendReminder(w, message)}><MessageCircle className="w-4 h-4" />Send on WhatsApp</button>
                    <button type="button" className={btnSec} onClick={() => d.act.log({ projectId: q.projectId, subjectKey: q.ref, channel: 'call' })}><Phone className="w-4 h-4" />Call instead</button>
                    <button type="button" className={btnSec} onClick={() => d.act.escalate({ projectId: q.projectId, subjectKey: q.ref })}><Flag className="w-4 h-4" />Escalate</button>
                    <button type="button" className={btnSec} onClick={() => d.act.log({ projectId: q.projectId, subjectKey: q.ref, outcome: 'replied' })}>{q.kind === 'payment' ? 'They paid or promised…' : 'They decided…'}</button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Sending opens WhatsApp with the message and logs the reminder for you. “{q.kind === 'payment' ? 'They paid or promised…' : 'They decided…'}” records the answer.</p>
                </div>
              )}
              {!w && !readOnly && d.canWrite && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {fu && fu.next && <button type="button" className={btnSec} onClick={() => d.act.later(q)}><CalendarClock className="w-4 h-4" />Later today</button>}
                  {q.projectId && <button type="button" className={btnSec} onClick={() => d.act.openClient(q.projectId)}><Users className="w-4 h-4" />Everything about this client</button>}
                  {lead && <button type="button" className={btnSec} onClick={() => d.act.openLead(lead.id)}><UserPlus className="w-4 h-4" />Open the lead</button>}
                  {q.projectId && <button type="button" className={btnSec} onClick={() => d.act.log({ projectId: q.projectId })}><ListChecks className="w-4 h-4" />Log a follow-up</button>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* ── The playbook drawer: the ? on each row ──────────────────────────────── */

export function PlaybookSheet({ kind, onClose }: { kind: QueueKind; onClose: () => void }) {
  const d = useDesk();
  const p = playbookOf(PLAYBOOK_OF[kind], d.settings);
  return (
    <div className="fixed inset-0 z-[300] flex justify-end" role="dialog" aria-label={p.title}>
      <motion.div className="absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside initial={{ x: '100%', rotateY: -12 }} animate={{ x: 0, rotateY: 0 }} exit={{ x: '100%', rotateY: -12 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        style={{ transformPerspective: 1400, transformOrigin: '100% 50%' }}
        className="relative w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <span className="group"><IconTile icon={BookOpen} size="sm" /></span>
          <div className="flex-1 min-w-0">
            <p className={BRAND_EYEBROW}>Playbook</p>
            <h3 className="font-bold text-slate-800">{p.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{p.custom ? 'Written by your leads for this studio.' : 'The desk’s own. Your leads can change it in Studio settings → Ops Desk.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <motion.ol variants={listV} initial="hidden" animate="show" className="p-5 flex flex-col gap-3">
          {p.steps.map((s, i) => (
            <motion.li key={i} variants={rowV} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-xs font-black grid place-items-center shrink-0 tabular-nums">{i + 1}</span>
              <p className="text-sm text-slate-700">{s}</p>
            </motion.li>
          ))}
        </motion.ol>
        {p.dont && <div className="mx-5 mb-5 rounded-xl bg-[#3D52A0]/5 border border-[#3D52A0]/20 px-3 py-2.5 text-xs text-slate-700"><b>Do not.</b> {p.dont.replace(/^Do not\s*/i, '').replace(/^./, (c) => c.toUpperCase())}</div>}
      </motion.aside>
    </div>
  );
}

/* ── This week ───────────────────────────────────────────────────────────── */

export function ThisWeek() {
  const d = useDesk();
  const today = dayKey(d.now);
  const days = Array.from({ length: 6 }, (_, i) => addDays(today, i));
  const live = d.visits.filter((v) => v.slot?.date && v.status !== 'cancelled' && v.status !== 'done');
  const next = [...live].filter((v) => v.slot!.date >= today).sort((a, b) => `${a.slot!.date}${a.slot!.time}`.localeCompare(`${b.slot!.date}${b.slot!.time}`))[0];
  return (
    <Panel icon={CalendarClock} title="This week" blurb="Meetings and visits on your clients">
      <div className="grid grid-cols-6 gap-1.5">
        {days.map((k, i) => {
          const n = live.filter((v) => v.slot!.date === k).length;
          const dt = new Date(`${k}T12:00:00+05:30`);
          return (
            <motion.div key={k} initial={{ opacity: 0, rotateY: -60 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ delay: i * 0.05, duration: 0.45 }}
              style={{ transformPerspective: 600 }}
              className={`rounded-xl border px-1 py-2 text-center ${i === 0 ? 'border-[#3D52A0] bg-[#3D52A0]/5 pp-today' : 'border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase text-slate-500">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
              <p className="text-sm font-black text-slate-800 tabular-nums">{dt.getDate()}</p>
              <p className="flex justify-center gap-0.5 h-1.5 mt-1">{Array.from({ length: Math.min(n, 3) }, (_, j) => <span key={j} className="w-1.5 h-1.5 rounded-full bg-[#3D52A0]" />)}</p>
            </motion.div>
          );
        })}
      </div>
      <p className="text-xs text-slate-600 mt-3">
        {next ? <><b className="font-bold text-slate-800">{new Date(`${next.slot!.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short' })} {clock12(next.slot!.time)}</b> {next.purpose || 'Meeting'}, {next.projectName}.{' '}
          <button type="button" className="text-[#3D52A0] font-bold" onClick={() => d.act.go('prep')}>Prepare</button></> : 'Nothing booked in the next six days.'}
      </p>
    </Panel>
  );
}

