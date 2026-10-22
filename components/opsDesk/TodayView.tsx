import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Inbox, Clock, IndianRupee, ListChecks, Flag, FileText, Phone, MessageCircle, Users, CalendarCheck, ClipboardCheck, FolderOpen, Star,
  UserPlus, Target, CircleHelp, Check, Lightbulb, CalendarClock, ChevronDown, AlertTriangle, BookOpen, X, ArrowRight, GraduationCap,
} from '@/lib/lucide-shim';
import { Dot } from '../ui/HudBits';
import { Glide, IconTile, Tilt, DoneTick, listV, rowV } from '../people/PeopleBits';
import { draftMessage, dayKey, addDays, type QueueItem, type QueueKind } from '../../lib/opsDesk';
import { explain, upNextLines, matchesWork, playbookOf, PLAYBOOK_OF, tipOfDay, WORK_FILTERS, guideProgress, type WorkFilter, type DoneToday } from '../../lib/opsTeam';
import { handoverSlip } from '../../lib/opsAssist';
import { clock12 } from '../../lib/peopleDesk';
import { leadName, mainPerson } from '../../lib/leads';
import { btnPri, btnSec, btnSm } from './OpsDeskPanels';
import { useDesk, seenSteps, Panel, Chip, Empty, Loading, EYEBROW, BRAND_EYEBROW, fmtDay, fmtTime, dialable, cardV } from './DeskBits';
import '../projectHeader/projectHeader.css';
import WaitingOnYou from '../notify/WaitingOnYou';

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
};
const GROUP_TONE = { overdue: 'bad', today: 'warn', week: 'ok', later: 'ok' } as const;
const GROUP_LABEL = { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later' } as const;

const ACTION: Record<QueueKind, string> = {
  next: 'Done', payment: 'Remind', decision: 'Remind', mom_review: 'Review', escalation_open: 'Decide', escalation_decided: 'Open',
  visit: 'Confirm', documents: 'Chase', checklist: 'Open', ask: 'Ask', lead: 'Call', lead_open: 'Open',
};

/* ── The whole Today section ─────────────────────────────────────────────── */

export function TodayView() {
  const d = useDesk();
  const open = d.queue;
  const progress = d.record ? guideProgress(d.record.guide, seenSteps(d)) : null;
  const newJoiner = !!d.record && !d.isLead && progress && progress.count < progress.total
    && d.now - d.record.startedAt < 14 * 86400000 && (!d.record.guideHiddenUntil || d.record.guideHiddenUntil <= dayKey(d.now));
  const head = open.find((q) => q.group === 'overdue' || q.group === 'today') || null;
  const dueCount = open.filter((q) => q.group === 'overdue' || q.group === 'today').length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <div className="flex flex-col gap-6 min-w-0">
        {newJoiner && progress && (
          <motion.button type="button" variants={cardV} initial="hidden" animate="show" onClick={() => d.act.go('guide')}
            className="group w-full text-left rounded-2xl border border-[#3D52A0]/30 bg-[#3D52A0]/5 px-5 py-3 flex items-center gap-3 pp-lift">
            <IconTile icon={GraduationCap} size="sm" />
            <span className="flex-1 min-w-0">
              <span className={BRAND_EYEBROW}>Your first week · {progress.count} of {progress.total} done</span>
              <span className="block text-sm font-semibold text-slate-800 truncate">Next: {progress.next?.title}</span>
            </span>
            <ArrowRight className="w-4 h-4 text-[#3D52A0] transition-transform group-hover:translate-x-1" />
          </motion.button>
        )}
        {d.loading && !open.length ? <Loading rows={2} /> : head ? <UpNext q={head} index={1} of={dueCount} /> : (
          <motion.div variants={cardV} initial="hidden" animate="show" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 flex items-center gap-4">
            <DoneTick size={44} />
            <div>
              <p className="font-bold text-slate-800">Nothing is due today.</p>
              <p className="text-xs text-slate-500 mt-0.5">{open.length ? 'What is left is for later this week.' : 'Log a call, add a lead, or look in on a client.'}</p>
            </div>
          </motion.div>
        )}
        {/* Someone waiting on you right now, with how long (components/notify). */}
        <WaitingOnYou />
        <Panel icon={Inbox} title="Today, in order" tour="today"
          blurb={d.isLead ? 'Escalations to decide and minutes to approve come first, then your own. Every row says why it is here; the ? explains the kind of work.' : 'Overdue first, then today. Every row says why it is here; the ? explains the kind of work.'}>
          <TodayList queue={open} done={d.done} />
        </Panel>
      </div>
      <div className="flex flex-col gap-6">
        <YourClients />
        <ThisWeek />
        <motion.div variants={cardV} initial="hidden" animate="show" className="group rounded-2xl border border-slate-200 bg-white shadow-sm p-4 flex gap-3 items-start">
          <IconTile icon={Lightbulb} size="sm" />
          <p className="text-xs text-slate-600"><b className="text-slate-800">Tip of the day.</b> {tipOfDay(d.now)}</p>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Up next ─────────────────────────────────────────────────────────────── */

function UpNext({ q, index, of }: { q: QueueItem; index: number; of: number }) {
  const d = useDesk();
  const still = useReducedMotion();
  const w = d.waiting.find((x) => x.projectId === q.projectId && x.key === q.ref) || null;
  const project = d.projects.find((p) => p.id === q.projectId);
  const slip = w ? handoverSlip(w, project?.targetHandover).days : 0;
  const e = explain(q, { waiting: w, settings: d.settings, slipDays: slip });
  const lines = upNextLines(q, e);
  const lead = q.kind === 'lead' || q.kind === 'lead_open' ? d.leads.find((l) => l.id === q.ref) : null;
  const phone = lead ? mainPerson(lead)?.phone : project?.raw?.context?.clientPhone;
  const message = w ? reminderText(d, w, q) : '';

  return (
    <div style={{ perspective: 1200 }}>
      <AnimatePresence mode="wait">
        <motion.div key={q.id}
          initial={still ? false : { opacity: 0, rotateX: -55, y: 24 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} exit={still ? undefined : { opacity: 0, rotateX: 55, y: -24 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: '50% 0%' }}>
          <Tilt max={4} className="rounded-2xl">
            <section className="group pp-glass rounded-2xl p-5 sm:p-6 relative overflow-hidden" data-tour="upnext">
              <span className="pp-glow" aria-hidden />
              <span className="absolute inset-y-0 left-0 w-1 bg-[#3D52A0]" aria-hidden />
              <div className="relative flex items-start gap-4">
                <IconTile icon={Target} size="md" />
                <div className="flex-1 min-w-0">
                  <p className={BRAND_EYEBROW}>Up next · {index} of {of}</p>
                  <h3 className="text-lg font-bold text-slate-800">{q.title}</h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {q.projectId ? <button type="button" className="font-semibold text-slate-700 hover:text-[#3D52A0] hover:underline" onClick={() => d.act.openClient(q.projectId)}>{q.projectName}</button> : <b className="font-semibold text-slate-700">{q.projectName}</b>}
                    {' · '}{KIND[q.kind].label} · {q.detail}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    {lines.map(([k, v], i) => (
                      <motion.div key={k} initial={still ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }}
                        className="rounded-xl bg-white/70 border border-slate-200 px-3 py-2.5">
                        <p className={EYEBROW}>{k}</p>
                        <p className="text-xs text-slate-700 mt-1">{v}</p>
                      </motion.div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    {(q.kind === 'payment' || q.kind === 'decision' || q.kind === 'lead') && phone ? (
                      <a href={`tel:+${dialable(phone)}`} onClick={() => (lead ? d.act.openLead(lead.id) : d.act.log({ projectId: q.projectId, subjectKey: q.ref, channel: 'call' }))}
                        className={`${btnPri} pp-press`}><Phone className="w-4 h-4" />Call now</a>
                    ) : (
                      <button type="button" className={`${btnPri} pp-press`} onClick={() => d.act.openItem(q)}>
                        {q.kind === 'next' ? <><Check className="w-4 h-4" />Mark it done</> : <>{ACTION[q.kind]}<ArrowRight className="w-4 h-4" /></>}
                      </button>
                    )}
                    {w && d.canWrite && (
                      <button type="button" className={btnSec} onClick={() => d.act.sendReminder(w, message)}><MessageCircle className="w-4 h-4" />WhatsApp the reminder</button>
                    )}
                    {lead && <button type="button" className={btnSec} onClick={() => d.act.openLead(lead.id)}><UserPlus className="w-4 h-4" />Open the lead</button>}
                    <button type="button" className={btnSec} onClick={() => d.act.later(q)}><Clock className="w-4 h-4" />Later today</button>
                    <span className="flex-1" />
                    <span className="text-[11px] text-slate-500">After you act, log it in one tap; the next one comes up.</span>
                  </div>
                </div>
              </div>
            </section>
          </Tilt>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** The message for a payment or decision, in the tone its reminders call for. Amounts only for roles that see money. */
function reminderText(d: ReturnType<typeof useDesk>, w: NonNullable<ReturnType<typeof useDesk>['waiting'][number]>, q?: QueueItem) {
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

/* ── Your clients ────────────────────────────────────────────────────────── */

function YourClients() {
  const d = useDesk();
  const rows = [...d.pulseRows].sort((a, b) => a.pulse.score - b.pulse.score);
  const tone = (b: string) => (b === 'at_risk' ? 'bad' : b === 'watch' ? 'warn' : 'ok') as 'bad' | 'warn' | 'ok';
  const blurb = d.isLead ? `${rows.length} on the desk` : `${rows.length} assigned to you`;
  return (
    <Panel icon={Users} title={d.isLead ? 'Clients on the desk' : 'Your clients'} blurb={blurb} tour="clients">
      {!rows.length ? <Empty text="No clients yet." /> : (
        <motion.div variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100 -mx-1">
          {rows.slice(0, 8).map(({ project: p, pulse }) => {
            const worst = pulse.reasons.filter((r) => r.points < 0).sort((a, b) => a.points - b.points)[0];
            const full = d.projects.find((x) => x.id === p.id);
            return (
              <motion.button variants={rowV} key={p.id} type="button" onClick={() => d.act.openClient(p.id)}
                className="w-full flex items-center gap-2.5 px-1 py-2 text-left rounded-lg hover:bg-slate-50 transition-colors">
                <Dot tone={tone(pulse.band)} live={pulse.band === 'at_risk'} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{p.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{[p.clientName, full?.status?.replace('_', ' ')].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-[11px] text-slate-500 text-right max-w-[110px] truncate">{worst ? worst.label : 'On track'}</span>
              </motion.button>
            );
          })}
          {rows.length > 8 && <button type="button" className="w-full text-left px-1 pt-2 text-xs font-bold text-[#3D52A0]" onClick={() => d.act.go('pulse')}>All {rows.length} clients</button>}
        </motion.div>
      )}
    </Panel>
  );
}

/* ── This week ───────────────────────────────────────────────────────────── */

function ThisWeek() {
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

