import React, { useMemo } from 'react';
import { Clock, FileText, Filter, Share2, Target, TrendingUp, XCircle } from '@/lib/lucide-shim';
import { HudDial } from '../HudCharts';
import { salesReport, inr, pctText, type OwnerReportInput } from '../../../lib/ownerReports';
import { ActionRow, BarRow, BRAND, Chip, Empty, Eyebrow, Figure, Panel, SmallButton, Stat, Track } from './ReportBits';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const FUNNEL = ['#94A3B8', '#7C8BC9', '#5C6FC0', '#4D60B0', BRAND, '#059669'];

export default function SalesSection({ input, onOpenLeads, onOpenProject }: {
  input: OwnerReportInput;
  onOpenLeads?: () => void;
  onOpenProject?: (id: string, tab?: string) => void;
}) {
  const s = useMemo(() => salesReport(input), [input]);
  const w = s.window;
  const top = s.funnel[0]?.count || 0;
  const drops = s.funnel.slice(1).map((f, i) => ({ i: i + 1, rate: s.funnel[i].count ? f.count / s.funnel[i].count : 1 }));
  const worst = drops.filter((d) => s.funnel[d.i - 1].count >= 3).sort((a, b) => a.rate - b.rate)[0];
  const totalLeads = s.sources.reduce((t, x) => t + x.leads, 0);
  const maxValue = Math.max(1, ...s.sources.map((x) => x.value));
  const maxReason = Math.max(1, ...s.reasons.map((r) => r.count));
  const maxOpen = Math.max(1, ...s.pipeline.stages.map((x) => x.value));
  const cover = s.monthlyTarget ? s.pipeline.expected / s.monthlyTarget : null;

  if (!s.leadsRead) {
    return <Empty>The leads on the Ops Desk could not be read, so Sales has nothing to count. Only the Owner, Admin and Ops Director can read every lead.</Empty>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel icon={Target} title="Are we winning enough of the right work?" blurb="How many asked, how fast we answered, and how many signed." lift={false}>
        <div className="flex gap-8 items-center flex-wrap">
          <HudDial value={s.winRate.rate ?? 0} max={100} readout={s.winRate.rate == null ? '—' : pctText(s.winRate.rate)}
            label="Win rate" sub={`${s.winRate.won} won, ${s.winRate.lost} lost`} color={BRAND} size={140} />
          <div className="flex-1 min-w-[280px] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Enquiries" value={s.enquiries} format="count" delay={120}
              line={s.hasPrev ? <><b className={s.enquiriesDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{s.enquiriesDelta >= 0 ? '▲' : '▼'} {Math.abs(s.enquiriesDelta)}</b> {w.compareLabel.replace(/^with /, 'on ')}</> : 'came in this period'} />
            <Stat label="First reply" value={s.firstReplyMin} format="count" suffix="min" delay={150} line="Typical time to the first call" />
            <Stat label="Enquiry to signed" value={s.daysToSign} format="days" delay={180}
              line={s.daysToSign != null && s.daysToSignPrev != null ? <>{s.daysToSign > s.daysToSignPrev ? <b className="text-rose-700">▲ {Math.round(s.daysToSign - s.daysToSignPrev)} days</b> : <b className="text-emerald-700">▼ {Math.round(s.daysToSignPrev - s.daysToSign)} days</b>} {s.daysToSign > s.daysToSignPrev ? 'slower' : 'faster'}</> : 'Typical, for leads signed'} />
            <Stat label="Average job" value={s.avgJob} format="inr" delay={210} line={s.perSqft ? `${inr(s.perSqft)} per sq ft` : 'Before GST'} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={Filter} title="Where leads drop off" blurb={`Every lead that came in, ${w.label === 'Last 3 months' ? 'in the last three months' : w.period === 'fy' ? 'this year' : `in ${w.label}`}, by the furthest step it reached.`} delay={100}
          foot={worst && top ? `The biggest drop is into "${s.funnel[worst.i].label.toLowerCase()}": ${s.funnel[worst.i - 1].count - s.funnel[worst.i].count} of ${s.funnel[worst.i - 1].count} did not get there. Stages come from the leads board on the Ops Desk.` : 'Stages come from the leads board on the Ops Desk.'}>
          {top === 0 ? <Empty>No leads came in during this period.</Empty> : (
            <div className="flex flex-col gap-3.5">
              {s.funnel.map((f, i) => (
                <BarRow key={f.key} delay={160 + i * 60} pct={(f.count / top) * 100} color={FUNNEL[i]}
                  label={<>{f.label}{i > 0 && s.funnel[i - 1].count > 0 && <span className={`text-[11px] ${worst?.i === i ? 'text-amber-700 font-bold' : 'text-slate-500'}`}> · {Math.round((f.count / s.funnel[i - 1].count) * 100)}%</span>}</>}
                  figure={f.count} figureClass={f.key === 'won' ? 'text-emerald-700' : 'text-slate-800'} />
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={Share2} title="Which sources bring work that signs" blurb="Sorted by the value each source has won." delay={160}
          foot={totalLeads ? 'Value won is the signed contract, before GST, of leads opened as projects. The source is picked when a lead is added on the Ops Desk.' : undefined}>
          {s.sources.length === 0 ? <Empty>No leads came in during this period.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Source', 'Leads', 'Won', 'Win rate', 'Value won', 'Average job'].map((h, i) => (
                      <th key={h} className={`py-2 px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.sources.map((x, i) => {
                    const rate = x.leads ? (x.won / x.leads) * 100 : 0;
                    return (
                      <tr key={x.source} className="hud-row-in border-b border-slate-100 last:border-0" style={{ animationDelay: `${220 + i * 30}ms` }}>
                        <td className="py-2.5 px-1.5">
                          <span className="font-semibold text-slate-800">{x.label}</span>
                          <Track pct={(x.value / maxValue) * 100} delay={260 + i * 30} className="mt-1.5 w-32" />
                        </td>
                        <td className="py-2.5 px-1.5 text-right tabular-nums text-slate-700">{x.leads}</td>
                        <td className="py-2.5 px-1.5 text-right tabular-nums text-slate-700">{x.won}</td>
                        <td className="py-2.5 px-1.5 text-right"><Chip tone={rate >= 30 ? 'ok' : rate >= 12 ? 'warn' : 'bad'}>{Math.round(rate)}%</Chip></td>
                        <td className="py-2.5 px-1.5 text-right tabular-nums font-bold text-slate-800">{inr(x.value)}</td>
                        <td className="py-2.5 px-1.5 text-right tabular-nums text-slate-700">{x.won ? inr(x.value / x.won) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel icon={XCircle} title="Why we lose" blurb={`${plural(s.lost, 'lead')} lost, by the reason given.`} delay={220}
          foot="The reason is picked when a lead is marked lost.">
          {s.reasons.length === 0 ? <Empty>No leads lost in this period.</Empty> : (
            <div className="flex flex-col gap-3">
              {s.reasons.map((r, i) => (
                <BarRow key={r.reason} label={r.reason} figure={r.count} pct={(r.count / maxReason) * 100} delay={280 + i * 50} color={i === 0 ? '#E11D48' : '#94A3B8'} />
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={FileText} title="Proposals gone quiet" blurb="Sent and not touched for 14 days or more." delay={280}
          foot={s.quiet.length ? `${s.quiet.reduce((t, q) => t + (q.value || 0), 0) ? `${inr(s.quiet.reduce((t, q) => t + (q.value || 0), 0))} waiting on ${plural(s.quiet.length, 'answer')}. ` : ''}Days count from the last touch logged on the lead.` : 'Days count from the last touch logged on the lead.'}>
          {s.quiet.length === 0 ? <Empty>Every proposal has been followed up in the last two weeks.</Empty> : (
            <div className="flex flex-col">
              {s.quiet.slice(0, 5).map((q, i, arr) => (
                <ActionRow key={q.id} tone={q.days >= 21 ? 'bad' : 'warn'} title={q.name} delay={340 + i * 30} last={i === arr.length - 1}
                  detail={`${q.value ? `${inr(q.value)} · ` : ''}quiet for ${plural(q.days, 'day')}`}
                  button={q.projectId && onOpenProject
                    ? <SmallButton onClick={() => onOpenProject(q.projectId as string)}>Open</SmallButton>
                    : onOpenLeads ? <SmallButton onClick={onOpenLeads}>Open leads</SmallButton> : undefined} />
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={Clock} title="Does a fast reply pay?" blurb="Leads decided, by how soon someone first called, and how many signed." delay={340}
          foot="Timed from the enquiry to the first call or message logged on the lead.">
          {s.decidedWithReply === 0 ? <Empty>No decided lead has a first call logged yet.</Empty> : (
            <div className="flex flex-col gap-3">
              {s.speed.map((x, i) => (
                <BarRow key={x.label} delay={400 + i * 50} label={`${x.label} · ${Math.round(x.share)}% of leads`}
                  figure={x.signed == null ? '—' : `${Math.round(x.signed)}% signed`} pct={x.signed ?? 0}
                  color={i === 0 ? '#059669' : i === 3 ? '#E11D48' : BRAND}
                  figureClass={i === 0 ? 'text-emerald-700' : i === 3 ? 'text-rose-700' : 'text-slate-800'} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel icon={TrendingUp} title="What is likely to sign next" blurb="Open projects by stage, and what they are worth once each stage's usual chance of signing is applied." delay={400} lift={false}
        aside={<div className="text-right"><Figure value={s.pipeline.expected} format="inr" /><div className="text-xs text-slate-500 mt-1.5">{cover != null ? `expected, about ${cover.toFixed(1)} months of target` : 'expected'}</div></div>}
        foot="Chances: lead 10%, drafting the proposal 15%, proposal sent 40%, negotiating 60%. A project's value is its BOQ before GST, so a lead with no BOQ yet counts at nothing.">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {s.pipeline.stages.map((x, i) => (
            <div key={x.key} className="hud-row-in rounded-xl border border-slate-200 p-4" style={{ animationDelay: `${460 + i * 40}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <Eyebrow>{x.label} · {x.count} open</Eyebrow>
                <Chip tone={x.chance >= 0.4 ? 'brand' : 'none'}>{Math.round(x.chance * 100)}%</Chip>
              </div>
              <div className="text-[11px] text-slate-500 mt-3">Open value {inr(x.value)}</div>
              <Track pct={(x.value / maxOpen) * 100} color="rgba(61,82,160,0.3)" delay={500 + i * 40} height="h-2" className="mt-1" />
              <div className="text-[11px] text-slate-500 mt-2.5">Expected <b className="text-slate-800 tabular-nums">{inr(x.expected)}</b></div>
              <Track pct={(x.expected / maxOpen) * 100} delay={560 + i * 40} height="h-2" className="mt-1" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
