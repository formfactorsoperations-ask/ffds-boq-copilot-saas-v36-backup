import React, { useMemo } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Home, ListChecks, MessageSquare, Phone, Plus, Users } from '@/lib/lucide-shim';
import { HudDial } from '../HudCharts';
import { QUIET_DAYS } from '../../../lib/leads';
import { deliveryReport, clientRelationsReport, inr, pctText, monthShort, type OwnerReportInput } from '../../../lib/ownerReports';
import { ActionRow, BarRow, BRAND, Chip, Columns, Empty, Eyebrow, Figure, Panel, SmallButton, Stat, Swatch, Track } from './ReportBits';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const initials = (name: string) => name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');

export default function DeliverySection({ input, onOpenProject }: {
  input: OwnerReportInput;
  onOpenProject?: (id: string, tab?: string) => void;
}) {
  const d = useMemo(() => deliveryReport(input), [input]);
  const cr = useMemo(() => clientRelationsReport(input), [input]);
  const h = d.handovers;
  const w = d.window;
  const SEV: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
  const maxSev = Math.max(1, ...d.snags.bySeverity.map((s) => s.count));

  return (
    <div className="flex flex-col gap-4">
      <Panel icon={Home} title="Are we handing over on time, without rework?" blurb="Promised dates against real ones, how long jobs take, and what clients find at handover." lift={false}
        foot={h.undated ? `${plural(h.undated, 'handover')} in this period had no target date, so ${h.undated === 1 ? 'it is' : 'they are'} not judged on time or late.` : undefined}>
        <div className="flex gap-8 items-center flex-wrap">
          <HudDial value={h.rate ?? 0} max={100} readout={h.rate == null ? '—' : pctText(h.rate)} label="On-time handovers"
            sub={h.judged ? `${h.onTime} of ${h.judged} on time` : 'none to judge yet'} color={h.rate != null && h.rate < input.targets.onTimePct ? '#D97706' : BRAND} size={140} />
          <div className="flex-1 min-w-[280px] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Average delay" value={h.avgDelay} format="days" tone={h.avgDelay ? 'warn' : undefined} delay={120} line={h.late ? `on the ${plural(h.late, 'late handover')}` : 'No late handovers'} />
            <Stat label="Signup to handover" value={d.avgDuration} format="days" delay={150} line={d.avgPlanned != null ? `Planned ${d.avgPlanned} on average` : 'For handovers in this period'} />
            <Stat label="Snags per handover" value={d.snagsPerHandover} format="count" delay={180} line="From the snag lists" />
            <Stat label="Live sites" value={d.liveSites} format="count" delay={210} line={d.liveArea ? `${Math.round(d.liveArea).toLocaleString('en-IN')} sq ft under work` : 'On site now'} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={AlertTriangle} title="Sites heading past their date" blurb="Live projects whose schedule ends after the handover date set on the project, or that are past it." delay={100}
          foot={d.liveWithoutTarget ? `${plural(d.liveWithoutTarget, 'live project')} ${d.liveWithoutTarget === 1 ? 'has' : 'have'} no target handover date, so ${d.liveWithoutTarget === 1 ? 'it' : 'they'} cannot show here.` : 'The reason is an open hold on the schedule, else the oldest decision waiting on the client.'}>
          {d.late.length === 0 ? <Empty>Every live site with a target date is on course.</Empty> : (
            <div className="flex flex-col">
              {d.late.slice(0, 6).map((x, i, arr) => (
                <ActionRow key={x.id} tone={x.daysLate >= 10 ? 'bad' : 'warn'} title={x.name} delay={160 + i * 30} last={i === arr.length - 1}
                  detail={`Promised ${day(x.targetAt)} · now ${day(x.forecastAt)} · ${x.reason}`}
                  chip={<Chip tone={x.daysLate >= 10 ? 'bad' : 'warn'}>{plural(x.daysLate, 'day')}</Chip>}
                  button={onOpenProject ? <SmallButton onClick={() => onOpenProject(x.id, 'timeline')}>Open</SmallButton> : undefined} />
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={BarChart3} title="Handovers by month" blurb={`On time and late, ${w.period === 'fy' ? 'since April' : w.period === 'quarter' ? 'in the last three months' : `in ${w.label}`}.`} delay={160}
          aside={<div className="flex gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Swatch color="#059669" />On time</span><span className="inline-flex items-center gap-1.5"><Swatch color="#D97706" />Late</span></div>}
          foot="On time means handed over on or before the target handover date set on the project.">
          {d.byMonth.every((m) => m.onTime + m.late === 0) ? <Empty>No handovers with a target date in this period.</Empty> : (
            <Columns delay={220} height={140}
              months={d.byMonth.map((m, i) => ({ key: m.key, label: monthShort(m.key), bold: i === d.byMonth.length - 1, parts: [{ value: m.onTime, color: '#059669' }, { value: m.late, color: '#D97706' }] }))} />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel icon={MessageSquare} title="Waiting on clients" blurb="Decisions sent for sign-off and not answered." delay={220} foot="From each project's decisions.">
          <div className="flex gap-6">
            <div><Figure value={d.waiting.length} format="count" /><div className="text-xs text-slate-500 mt-1.5">open decisions</div></div>
            <div><Figure value={d.waitingMedian} format="days" /><div className="text-xs text-slate-500 mt-1.5">typical wait</div></div>
          </div>
          {d.waiting.length > 0 && (
            <div className="mt-3 flex flex-col">
              {d.waiting.slice(0, 4).map((x, i, arr) => (
                <ActionRow key={`${x.projectId}-${x.title}-${i}`} tone={(x.days || 0) >= 14 ? 'bad' : 'warn'} delay={280 + i * 30} last={i === arr.length - 1}
                  title={<span className="text-xs font-normal text-slate-700">{x.project} · {x.title}</span>}
                  chip={x.days != null ? <Chip tone={x.days >= 14 ? 'bad' : 'warn'}>{plural(x.days, 'day')}</Chip> : undefined} />
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={Plus} title="Work added after the BOQ froze" blurb={`Scope additions raised ${w.period === 'fy' ? 'this year' : w.period === 'quarter' ? 'in the last three months' : `in ${w.label}`}.`} delay={280}
          foot="Before GST. Additions done on site and never raised are money given away: raise them before handover.">
          <div className="flex gap-6">
            <div><Figure value={d.additions.authorised} format="inr" color="text-emerald-700" /><div className="text-xs text-slate-500 mt-1.5">authorised, {plural(d.additions.authorisedCount, 'request')}</div></div>
            <div><Figure value={d.additions.share} format="pct" /><div className="text-xs text-slate-500 mt-1.5">on top of contract value</div></div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <BarRow label="Authorised and paid" figure={inr(d.additions.collected)} pct={d.additions.authorised ? (d.additions.collected / d.additions.authorised) * 100 : 0} color="#059669" delay={340} />
            <BarRow label="Authorised, not yet paid" figure={inr(Math.max(0, d.additions.authorised - d.additions.collected))} pct={d.additions.authorised ? ((d.additions.authorised - d.additions.collected) / d.additions.authorised) * 100 : 0} delay={390} />
            <BarRow label="Waiting for the client to approve" figure={`${inr(d.additions.waiting)} · ${d.additions.waitingCount}`} figureClass="text-amber-700"
              pct={d.additions.authorised + d.additions.waiting ? (d.additions.waiting / (d.additions.authorised + d.additions.waiting)) * 100 : 0} color="#D97706" delay={440} />
          </div>
        </Panel>

        <Panel icon={CheckCircle2} title="Finish quality" blurb="Snags on live sites and on this period's handovers." delay={340} foot="From the snag lists. Open snags by how serious they are.">
          <div className="flex gap-6">
            <div><Figure value={d.snags.quickPct} format="pct" /><div className="text-xs text-slate-500 mt-1.5">closed within 7 days</div></div>
            <div><Figure value={d.snags.openOld} format="count" color={d.snags.openOld ? 'text-rose-700' : 'text-slate-800'} /><div className="text-xs text-slate-500 mt-1.5">open past 7 days</div></div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {d.snags.bySeverity.map((s, i) => (
              <BarRow key={s.severity} label={`${SEV[s.severity]} · open`} figure={s.count} pct={(s.count / maxSev) * 100} delay={400 + i * 50} color={s.severity === 'high' ? '#E11D48' : s.severity === 'medium' ? '#D97706' : '#94A3B8'} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel icon={Users} title="Can the design and site team take more work?" blurb="Live and signed projects per Designer and Site Supervisor, against how many each carries well." delay={400} lift={false}
        aside={
          <div className="flex gap-8 flex-wrap">
            <div><Eyebrow>Team</Eyebrow><div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{d.headcount ?? '—'}</div><div className="text-[11px] text-slate-500">people</div></div>
            <div><Eyebrow>Room for</Eyebrow><div className="mt-1.5 text-2xl font-black text-emerald-700 tabular-nums">{plural(d.room, 'project')}</div><div className="text-[11px] text-slate-500">before a Designer is full</div></div>
          </div>
        }
        foot={<>
          The Designers and Site Supervisors on the studio team (Studio settings → Team), with the live and signed projects each is assigned to. Client Relations coordinate every project, so they are judged on their leads below instead. How many one person carries is set in Set targets. Only the Owner, Admin and Ops Director see this.
          {d.notOnTeam.length > 0 && <> <b className="text-amber-700">{plural(d.notOnTeam.length, 'address', 'addresses')} still assigned to projects {d.notOnTeam.length === 1 ? 'is' : 'are'} not on the team</b> ({d.notOnTeam.join(', ')}): take {d.notOnTeam.length === 1 ? 'it' : 'them'} off those projects from the project header.</>}
        </>}>
        {d.team.length === 0 ? <Empty>No Designers or Site Supervisors are on the studio team yet. Add them in Studio settings → Team.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Person', 'Role', 'Load', 'Projects', 'Booked this year', ''].map((x, i) => (
                    <th key={i} className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-left ${i === 2 ? 'w-[34%]' : ''}`}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.team.map((r, i) => {
                  const load = r.live / r.capacity;
                  const tone = load > 1 ? 'bad' : load >= 1 ? 'warn' : 'ok';
                  return (
                    <tr key={`${r.kind}-${r.email}`} className="hud-row-in border-b border-slate-100 last:border-0" style={{ animationDelay: `${460 + i * 30}ms` }}>
                      <td className="py-3 px-2">
                        <span className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-xs font-bold flex items-center justify-center shrink-0">{initials(r.name)}</span>
                          <span className="font-semibold text-slate-800">{r.name}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-700">{r.role}</td>
                      <td className="py-3 px-2"><Track pct={load * 100} height="h-2" delay={500 + i * 30} color={tone === 'bad' ? '#E11D48' : tone === 'warn' ? '#D97706' : '#059669'} /></td>
                      <td className="py-3 px-2 tabular-nums text-slate-700">{r.live} of {r.capacity}</td>
                      <td className="py-3 px-2 tabular-nums text-slate-700">{r.kind === 'design' && r.booked ? inr(r.booked) : '—'}</td>
                      <td className="py-3 px-2 text-right"><Chip tone={tone}>{tone === 'bad' ? 'Over' : tone === 'warn' ? 'Full' : 'Room'}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel icon={Phone} title="Is Client Relations keeping up?" delay={460} lift={false}
        blurb="The leads each person owns, how fast they answer, and what they turn into. Load is open leads, not projects."
        foot={`From the leads board on the Ops Desk: each lead's owner, first call, last touch and stage. Behind means a lead has waited over an hour for its first call, or more than five have gone quiet for ${QUIET_DAYS} days. How many open leads one person carries is set in Set targets (${input.targets.leadsPerClientRelations} now).`}>
        {!cr.leadsRead ? <Empty>The leads on the Ops Desk could not be read, so Client Relations has nothing to count.</Empty>
          : cr.rows.length === 0 ? <Empty>Nobody on the studio team is in Client Relations, and no lead has an owner yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Person', 'Open leads', 'Not called in an hour', `Quiet ${QUIET_DAYS}+ days`, 'First reply', 'Meetings held', 'Won', ''].map((x, i) => (
                    <th key={i} className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-left ${i === 1 ? 'w-[22%]' : ''}`}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cr.rows.map((r, i) => {
                  const load = r.open / r.capacity;
                  return (
                    <tr key={r.email} className="hud-row-in border-b border-slate-100 last:border-0" style={{ animationDelay: `${520 + i * 30}ms` }}>
                      <td className="py-3 px-2">
                        <span className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-xs font-bold flex items-center justify-center shrink-0">{initials(r.name)}</span>
                          <span className="min-w-0"><span className="block font-semibold text-slate-800">{r.name}</span><span className="block text-[11px] text-slate-500">{r.role}</span></span>
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="font-bold tabular-nums text-slate-800">{r.open} of {r.capacity}</span>
                        <Track pct={load * 100} height="h-2" delay={560 + i * 30} className="mt-1.5" color={load > 1 ? '#E11D48' : load >= 0.85 ? '#D97706' : '#059669'} />
                      </td>
                      <td className="py-3 px-2"><Chip tone={r.notCalled ? 'bad' : 'none'}>{r.notCalled}</Chip></td>
                      <td className="py-3 px-2"><Chip tone={r.quiet > 5 ? 'bad' : r.quiet ? 'warn' : 'none'}>{r.quiet}</Chip></td>
                      <td className="py-3 px-2 tabular-nums text-slate-700">{r.firstReplyMin == null ? '—' : `${r.firstReplyMin} min`}</td>
                      <td className="py-3 px-2 tabular-nums text-slate-700">{r.meetings}</td>
                      <td className="py-3 px-2 tabular-nums text-slate-700">{r.decided ? `${r.won} of ${r.decided} · ${Math.round((r.won / r.decided) * 100)}%` : '—'}</td>
                      <td className="py-3 px-2 text-right"><Chip tone={r.state === 'over' ? 'bad' : r.state === 'behind' ? 'warn' : 'ok'}>{r.state === 'over' ? 'Over' : r.state === 'behind' ? 'Behind' : 'On top'}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel icon={ListChecks} title="What Client Relations is chasing across all projects" delay={520} lift={false}
        blurb="The studio-wide follow-ups that sit with them, whoever designs the project."
        foot="Overdue invoices are in Money, decisions on each project, and quiet proposals on the Ops Desk leads board.">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat label="Overdue invoices" value={cr.chase.overdue} format="inr" tone={cr.chase.overdue > 0 ? 'bad' : undefined} delay={560}
            line={cr.chase.overdueInvoices ? `${plural(cr.chase.overdueInvoices, 'invoice')}, oldest ${plural(cr.chase.oldestOverdueDays, 'day')}` : 'Nothing overdue'} />
          <Stat label="Decisions waiting on clients" value={cr.chase.waiting} format="count" delay={590}
            line={cr.chase.longestWait ? `Longest ${cr.chase.longestWait.days != null ? plural(cr.chase.longestWait.days, 'day') : ''}, ${cr.chase.longestWait.project}` : 'None waiting'} />
          <Stat label="Proposals quiet 14 days" value={cr.chase.quietProposals} format="count" delay={620}
            line={cr.chase.quietValue ? `${inr(cr.chase.quietValue)} waiting on an answer` : cr.chase.quietProposals ? 'Waiting on an answer' : 'All followed up'} />
          <Stat label="Live clients" value={cr.chase.liveClients} format="count" delay={650} line="Signed and on site, all coordinated by Client Relations" />
        </div>
      </Panel>
    </div>
  );
}
