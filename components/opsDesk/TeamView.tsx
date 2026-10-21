import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Users, FileText, Star, ArrowRight, UserPlus, Sunset, Eye, X, FolderOpen } from '@/lib/lucide-shim';
import { Dot, CountUp } from '../ui/HudBits';
import { Ring, Tilt, listV, rowV } from '../people/PeopleBits';
import { GUIDE_STEPS, agoLabel, type TeamRow, type DoneToday } from '../../lib/opsTeam';
import { waitedLabel } from '../../lib/leads';
import type { QueueItem, QueueKind } from '../../lib/opsDesk';
import type { DayNote } from '../../services/opsPeopleService';
import { btnSm, btnSec } from './OpsDeskPanels';
import { useDesk, Panel, Chip, Avatar, Empty, EYEBROW, fmtTime, firstName, type Section } from './DeskBits';
import { TodayList, KIND } from './TodayView';

/*
  THE LEAD'S VIEW (mockup OD6). Each person's desk at a glance: their clients,
  how much of today is done, what is overdue, new leads and when they last
  logged anything. Tap a name to see their Today list as they see it. Beside
  it, what is waiting for the lead, the desk's own numbers for the week, and the
  notes the team left when they closed their day. New people are given clients
  here (Assign clients) and added to the team in Studio settings.
*/

export function TeamView({ rows, queueOf, doneOf, notes, guideOf, week, onAssign, onRead }: {
  rows: TeamRow[];
  queueOf: (email: string) => QueueItem[];
  doneOf: (email: string) => DoneToday[];
  notes: DayNote[];
  guideOf: (email: string) => number;
  week: { logged: number; calls: number; paymentsChased: number; avgFirstCallMin: number | null; decided: number };
  onAssign: (email: string) => void;
  onRead: (n: DayNote) => void;
}) {
  const d = useDesk();
  const [viewing, setViewing] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const person = rows.find((r) => r.person.email === viewing);
  const newcomers = rows.filter((r) => r.person.isNew);
  const unread = notes.filter((n) => !(n.readBy || []).includes(d.me.email));
  const waitingFor: [string, number, Section | 'notes'][] = [
    ['Minutes to approve', d.moms.filter((m) => m.status === 'pending_review').length, 'minutes'],
    ['Escalations to decide', d.escalations.filter((e) => e.status === 'open').length, 'escalations'],
    ['Leads to turn into projects', d.leads.filter((l) => l.openRequest && !l.projectId && l.stage !== 'lost').length, 'leads'],
    ['Day-end notes', unread.length, 'notes'],
  ];
  const WORDS: Partial<Record<QueueKind, string>> = {
    payment: 'payment reminders', decision: 'decisions to chase', next: 'next steps', lead: 'leads to call', visit: 'visits to confirm',
    documents: 'documents to chase', checklist: 'checklists', escalation_decided: 'decisions to act on', ask: 'reviews to ask for',
  };
  const kindWords = (k: QueueKind[]) => {
    const w = k.map((x) => WORDS[x] || KIND[x].label.toLowerCase());
    return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0];
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
      <div className="flex flex-col gap-6 min-w-0">
        <Panel icon={Users} title="The team today" blurb="Each person’s desk at a glance. Tap a name to see their Today list as they see it."
          right={<button type="button" className={btnSm} onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'studio-settings' }))}><UserPlus className="w-3.5 h-3.5" />Add someone</button>}>
          {!rows.length ? <Empty icon={Users} text="Nobody on the team works the desk yet. Add a Client Relations person in Studio settings → Team, then give them clients here." /> : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className={`${EYEBROW} text-left`}>
                    <th className="py-2 px-1">Person</th><th className="px-2">Clients</th><th className="px-2">Done</th><th className="px-2">Overdue</th><th className="px-2">New leads</th><th className="px-2">Last log</th><th className="px-1" />
                  </tr>
                </thead>
                <motion.tbody variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <motion.tr variants={rowV} key={r.person.email}
                      className={`cursor-pointer transition-colors ${viewing === r.person.email ? 'bg-[#3D52A0]/5' : 'hover:bg-slate-50'}`}
                      onClick={() => setViewing(viewing === r.person.email ? null : r.person.email)}>
                      <td className="py-2.5 px-1">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={r.person.name} />
                          <span className="min-w-0">
                            <b className="font-semibold text-slate-800">{r.person.name}</b>
                            <span className="block text-[11px] text-slate-500">{r.person.role}{r.person.isNew ? ' · first week' : ''}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 font-black text-slate-800 tabular-nums"><CountUp value={r.clients} /></td>
                      <td className="px-2">
                        <span className="inline-flex items-center gap-2">
                          <Ring value={r.total ? r.done / r.total : 0} size={26} stroke={4} tone={r.total && r.done === r.total ? 'ok' : 'brand'} label={`${r.done} of ${r.total} done`} />
                          <span className="tabular-nums text-slate-700">{r.done}/{r.total}</span>
                        </span>
                      </td>
                      <td className="px-2">{r.overdue ? <Chip tone="rose">{r.overdue} overdue</Chip> : <Chip tone="emerald">None</Chip>}</td>
                      <td className="px-2 tabular-nums text-slate-700">{r.leadsNew}</td>
                      <td className="px-2 text-xs text-slate-500">{agoLabel(r.lastLogAt, d.now)}</td>
                      <td className="px-1">
                        <span className="flex items-center gap-2 justify-end">
                          <button type="button" className={btnSm} onClick={(e) => { e.stopPropagation(); onAssign(r.person.email); }}><FolderOpen className="w-3.5 h-3.5" />Assign clients</button>
                          <Dot tone={r.tone} />
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
          {newcomers.map((r) => (
            <p key={r.person.email} className="mt-4 rounded-xl bg-[#3D52A0]/5 border border-[#3D52A0]/20 px-4 py-3 text-xs text-slate-700">
              <b>{firstName(r.person.name)} is in their first week:</b> {guideOf(r.person.email)} of {GUIDE_STEPS.length} guide steps done.
              {r.overdue ? ` Their overdue items are ${kindWords(r.overdueKinds)}; the ? on each row opens the playbook for it.` : ' Nothing of theirs is overdue.'}
            </p>
          ))}
        </Panel>

        <AnimatePresence mode="wait">
          {person && (
            <motion.div key={person.person.email} initial={{ opacity: 0, rotateX: -20, y: 20 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} exit={{ opacity: 0, rotateX: 15, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ transformPerspective: 1200 }}>
              <Panel icon={Eye} title={`${firstName(person.person.name)}’s Today, as they see it`} blurb="Read-only. Their next steps, the payments and decisions on their clients, and their leads."
                right={<button type="button" className={btnSm} onClick={() => setViewing(null)}><X className="w-3.5 h-3.5" />Close</button>}>
                <TodayList queue={queueOf(person.person.email)} done={doneOf(person.person.email)} readOnly />
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-6">
        <Panel icon={FileText} title="Waiting for you" blurb="Decide these first">
          <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-1 text-sm">
            {waitingFor.map(([t, n, to]) => (
              <motion.li variants={rowV} key={t}>
                <button type="button" onClick={() => (to === 'notes' ? setShowNotes(true) : d.act.go(to))}
                  className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                  <span className="flex-1 text-slate-700">{t}</span>
                  <b className={`font-black tabular-nums ${n ? 'text-slate-800' : 'text-slate-400'}`}><CountUp value={n} /></b>
                  <ArrowRight className="w-4 h-4 text-slate-400 transition-transform group-hover:translate-x-1" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        </Panel>
        <Panel icon={Star} title="This week" blurb="The desk’s own numbers, last seven days">
          <motion.div variants={listV} initial="hidden" animate="show" className="grid grid-cols-2 gap-2">
            {([
              ['Follow-ups logged', week.logged], ['Calls', week.calls], ['Payments chased', week.paymentsChased],
              ['Avg first call to a lead', week.avgFirstCallMin], ['Escalations decided', week.decided],
            ] as [string, number | null][]).map(([k, v]) => (
              <motion.div variants={rowV} key={k}>
                <Tilt max={8} className="rounded-xl">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 h-full">
                    <p className="text-lg font-black text-slate-800 tabular-nums">{v == null ? '—' : k.startsWith('Avg') && v >= 60 ? waitedLabel(v) : <><CountUp value={v} />{k.startsWith('Avg') ? ' min' : ''}</>}</p>
                    <p className="text-[11px] text-slate-500">{k}</p>
                  </div>
                </Tilt>
              </motion.div>
            ))}
          </motion.div>
        </Panel>
        <Panel icon={Sunset} title="Day-end notes" blurb="What the team left when they closed their day"
          right={notes.length ? <button type="button" className={btnSm} onClick={() => setShowNotes(!showNotes)}>{showNotes ? 'Less' : `All ${notes.length}`}</button> : undefined}>
          {!notes.length ? <p className="text-xs text-slate-500">No day closed this week yet.</p> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-3">
              {(showNotes ? notes : notes.slice(0, 3)).map((n) => {
                const read = (n.readBy || []).includes(d.me.email);
                return (
                  <motion.li variants={rowV} key={`${n.email}${n.day}`} className={`rounded-xl border px-3 py-2.5 ${read ? 'border-slate-200' : 'border-[#3D52A0]/30 bg-[#3D52A0]/5'}`}>
                    <p className="text-xs font-bold text-slate-800">{n.name} · {new Date(`${n.day}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTime(n.at)}</p>
                    <p className="text-[11px] text-slate-500">{n.closed.length} closed · {n.rolled.length} rolled over</p>
                    {n.note && <p className="text-xs text-slate-700 mt-1 whitespace-pre-line">{n.note}</p>}
                    {!read && <button type="button" className="mt-1.5 text-[11px] font-bold text-[#3D52A0]" onClick={() => onRead(n)}>Mark read</button>}
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </Panel>
        <button type="button" className={`${btnSec} w-full`} onClick={() => d.act.go('guide')}>How the desk works for a new joiner</button>
      </div>
    </div>
  );
}
