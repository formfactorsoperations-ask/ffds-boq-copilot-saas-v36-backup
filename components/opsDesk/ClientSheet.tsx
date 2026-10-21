import React from 'react';
import { motion } from 'framer-motion';
import { X, Phone, MessageCircle, Mail, CalendarCheck, ListChecks, Clock, FolderOpen, Flag } from '@/lib/lucide-shim';
import { listV, rowV, Tilt } from '../people/PeopleBits';
import { Dot, CountUp } from '../ui/HudBits';
import { inr, dayKey, daysBetween } from '../../lib/opsDesk';
import { clientPeople } from '../../lib/clientContacts';
import { clock12 } from '../../lib/peopleDesk';
import { logLine } from '../../lib/opsTeam';
import { btnPri, btnSec } from './OpsDeskPanels';
import { useDesk, Panel, Avatar, BRAND_EYEBROW, EYEBROW, fmtDay, fmtWhen, dialable, waLink } from './DeskBits';

/*
  EVERYTHING ABOUT ONE CLIENT (mockup OD3). Any client name on the desk opens
  it: how the client is doing, when we last spoke, the next meeting, everything
  still open from every screen, and every call, message, meeting and minutes in
  one timeline. What they owe shows only to the roles that see the studio's
  money; Client Relations' copy of the project has no amounts in it at all.
*/

export const ClientSheet: React.FC<{ projectId: string; onClose: () => void }> = ({ projectId, onClose }) => {
  const d = useDesk();
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) return null;
  const ctx = p.raw?.context || {};
  const people = clientPeople(ctx);
  const main = people[0];
  const row = d.pulseRows.find((r) => r.project.id === projectId);
  const band = row?.pulse.band || 'good';
  const today = dayKey(d.now);
  const logs = d.followUps.filter((f) => f.projectId === projectId).sort((a, b) => b.at - a.at);
  const last = logs[0]?.at || null;
  const nextVisit = d.visits.filter((v) => v.projectId === projectId && v.slot?.date && v.slot.date >= today && v.status !== 'cancelled' && v.status !== 'done')
    .sort((a, b) => `${a.slot!.date}${a.slot!.time}`.localeCompare(`${b.slot!.date}${b.slot!.time}`))[0];
  const owes = d.seesMoney && p.money ? p.money.milestones.filter((m) => m.status === 'invoiced').reduce((n, m) => n + (m.owed || 0), 0) : null;

  const open: { text: string; where: string; tone: 'bad' | 'warn' | 'ok' }[] = [
    ...d.waiting.filter((w) => w.projectId === projectId).map((w) => ({
      text: `${w.kind === 'payment' ? 'Payment' : 'Decision'}: ${w.label}`, where: w.kind === 'payment' ? 'Payments' : 'Waiting on client',
      tone: (w.overdueDays || w.days >= 7 ? 'bad' : 'warn') as 'bad' | 'warn',
    })),
    ...logs.filter((f) => f.next && !f.nextDone).map((f) => ({ text: f.next!.text, where: `Next step · ${f.next!.ownerName} · ${fmtDay(f.next!.due)}`, tone: (f.next!.due < today ? 'bad' : 'ok') as 'bad' | 'ok' })),
    ...d.escalations.filter((e) => e.projectId === projectId && e.status !== 'closed').map((e) => ({ text: e.title, where: e.status === 'open' ? 'Escalation' : 'Decision back', tone: (e.status === 'open' ? 'bad' : 'ok') as 'bad' | 'ok' })),
    ...d.moms.filter((m) => m.projectId === projectId && (m.status === 'draft' || m.status === 'pending_review')).map((m) => ({ text: m.meetingTitle || m.momRef || 'Minutes', where: m.status === 'draft' ? 'Minutes · draft' : 'Minutes · awaiting approval', tone: 'warn' as const })),
    ...d.queue.filter((q) => q.projectId === projectId && (q.kind === 'documents' || q.kind === 'checklist' || q.kind === 'visit')).map((q) => ({ text: q.title, where: q.kind === 'visit' ? 'Meetings & visits' : 'Checklist', tone: 'warn' as const })),
  ];

  const touches = [
    ...logs.map((f) => ({ at: f.at, title: logLine(f), sub: `${f.byName || f.by} · ${fmtWhen(f.at)}${f.note ? ` · ${f.note.split('\n')[0].slice(0, 80)}` : ''}`, dot: f.outcome === 'replied' || f.outcome === 'promised' ? 'bg-emerald-500' : f.outcome === 'no_answer' || f.outcome === 'reminded' ? 'bg-amber-500' : 'bg-[#3D52A0]' })),
    ...d.moms.filter((m) => m.projectId === projectId && m.meetingDate).map((m) => ({ at: m.meetingDate as number, title: `Minutes ${m.momRef || ''}: ${m.meetingTitle || 'Meeting'}`.replace('  ', ' '), sub: `${m.status.replace('_', ' ')} · ${fmtDay(dayKey(m.meetingDate as number))}`, dot: 'bg-[#3D52A0]' })),
    ...d.visits.filter((v) => v.projectId === projectId && v.status === 'done' && v.slot?.date).map((v) => ({ at: new Date(`${v.slot!.date}T12:00:00+05:30`).getTime(), title: v.purpose || 'Visit', sub: `Done · ${fmtDay(v.slot!.date)}`, dot: 'bg-slate-300' })),
  ].sort((a, b) => b.at - a.at).slice(0, 25);

  const tiles: [string, React.ReactNode, string][] = [
    ['Pulse', band === 'at_risk' ? 'At risk' : band === 'watch' ? 'Watch' : 'Good', band === 'at_risk' ? 'text-rose-700' : band === 'watch' ? 'text-amber-700' : 'text-emerald-700'],
    ...(owes != null ? [['Owes', owes ? inr(owes) : 'Nothing due', owes ? 'text-amber-700' : 'text-slate-800'] as [string, React.ReactNode, string]] : [['Waiting on', <><CountUp value={open.length} /> open</>, 'text-slate-800'] as [string, React.ReactNode, string]]),
    ['Last contact', last ? (daysBetween(last, d.now) ? `${daysBetween(last, d.now)} days` : 'Today') : 'None logged', 'text-slate-800'],
    ['Next meeting', nextVisit ? `${new Date(`${nextVisit.slot!.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} ${clock12(nextVisit.slot!.time)}` : 'None booked', 'text-slate-800'],
  ];
  const names = people.slice(0, 2).map((x) => x.name).filter(Boolean).join(' & ') || p.clientName || 'The client';

  return (
    <div className="fixed inset-0 z-[300] flex justify-end" role="dialog" aria-label={`Client: ${names}`}>
      <motion.div className="absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside initial={{ x: '100%', rotateY: -10 }} animate={{ x: 0, rotateY: 0 }} exit={{ x: '100%', rotateY: -10 }}
        transition={{ type: 'spring', stiffness: 240, damping: 30 }} style={{ transformPerspective: 1600, transformOrigin: '100% 50%' }}
        className="relative w-full max-w-xl h-full bg-[#F6F7FB] border-l border-slate-200 shadow-2xl overflow-y-auto">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Avatar name={names} client size="md" />
            <div className="flex-1 min-w-0">
              <p className={BRAND_EYEBROW}>Client · {p.name}{p.location ? `, ${p.location}` : ''}</p>
              <h3 className="text-lg font-bold text-slate-800">{names}</h3>
              <p className="text-xs text-slate-500">{[p.config, p.status.replace('_', ' '), p.targetHandover ? `handover ${fmtDay(p.targetHandover)}` : ''].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/60"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {main?.phone && <a className={`${btnPri} !py-1.5 !text-xs pp-press`} href={`tel:+${dialable(main.phone)}`}><Phone className="w-3.5 h-3.5" />Call</a>}
            {main?.phone && <a className={`${btnSec} !py-1.5 !text-xs`} href={waLink(main.phone, `Hi ${main.name || ''},`)} target="_blank" rel="noreferrer"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>}
            {main?.email && <a className={`${btnSec} !py-1.5 !text-xs`} href={`mailto:${people.map((x) => x.email).filter(Boolean).join(',')}`}><Mail className="w-3.5 h-3.5" />Email</a>}
            {d.canWrite && <button type="button" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => d.act.bookVisit(projectId)}><CalendarCheck className="w-3.5 h-3.5" />Book a meeting</button>}
            {d.canWrite && <button type="button" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => d.act.log({ projectId })}><ListChecks className="w-3.5 h-3.5" />Log a follow-up</button>}
            <button type="button" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => d.act.openProject(projectId)}><FolderOpen className="w-3.5 h-3.5" />Open the project</button>
          </div>
          <motion.div variants={listV} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tiles.map(([k, v, cls]) => (
              <motion.div key={k} variants={rowV}>
                <Tilt max={8} className="rounded-xl">
                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2 h-full">
                    <p className={EYEBROW}>{k}</p>
                    <p className={`text-sm font-black tabular-nums ${cls}`}>{v}</p>
                  </div>
                </Tilt>
              </motion.div>
            ))}
          </motion.div>
          {people.length > 1 && (
            <p className="text-[11px] text-slate-500">On the client’s side: {people.map((x) => `${x.name}${x.role ? ` (${x.role})` : x.main ? ' (main)' : ''}`).join(' · ')}</p>
          )}
          <Panel icon={ListChecks} title="Open with this client" blurb="Everything still open, from every screen">
            {!open.length ? <p className="text-xs text-slate-500">Nothing open. A good moment to check in.</p> : (
              <motion.div variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100 text-sm">
                {open.map((o, i) => (
                  <motion.div variants={rowV} key={`${o.text}${i}`} className="flex items-center gap-2 py-2">
                    <Dot tone={o.tone} /><span className="flex-1 min-w-0 truncate text-slate-800">{o.text}</span><span className="text-[11px] text-slate-500 text-right">{o.where}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </Panel>
          <Panel icon={Clock} title="Every touch" blurb="Calls, WhatsApps, emails, meetings and minutes, newest first">
            {!touches.length ? <p className="text-xs text-slate-500">Nothing logged yet.</p> : (
              <motion.ol variants={listV} initial="hidden" animate="show" className="relative border-l border-slate-200 ml-2 flex flex-col gap-3">
                {touches.map((t, i) => (
                  <motion.li variants={rowV} key={`${t.at}${i}`} className="pl-4 relative">
                    <span style={{ left: -5 }} className={`absolute top-1.5 w-2.5 h-2.5 rounded-full ${t.dot}`} />
                    <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                    <p className="text-[11px] text-slate-500">{t.sub}</p>
                  </motion.li>
                ))}
              </motion.ol>
            )}
          </Panel>
          {d.escalations.some((e) => e.projectId === projectId && e.status === 'open') && (
            <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5"><Flag className="w-3.5 h-3.5 text-rose-500" />An escalation on this client is waiting for a lead.</p>
          )}
          <p className="text-[11px] text-slate-500">Opens from any client name on the desk. Amounts show only to the roles that see the studio’s money.</p>
        </div>
      </motion.aside>
    </div>
  );
};
