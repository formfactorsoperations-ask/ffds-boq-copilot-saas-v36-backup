import React, { useMemo } from 'react';
import { Calendar, Clock, Layers, LineChart, Percent, Users, Wallet } from '@/lib/lucide-shim';
import { HudDial } from '../HudCharts';
import { moneyReport, inr, pctText, monthShort, type OwnerReportInput } from '../../../lib/ownerReports';
import { ActionRow, BRAND, Chip, Columns, Empty, Eyebrow, Figure, Panel, SmallButton, SplitBar, Stat, Swatch, Track } from './ReportBits';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const AGE_COLOURS = ['#94A3B8', '#D97706', '#E11D48', '#9F1239'];

export default function MoneySection({ input, onOpenProject, onSetTargets }: {
  input: OwnerReportInput;
  onOpenProject?: (id: string, tab?: string) => void;
  onSetTargets?: () => void;
}) {
  const m = useMemo(() => moneyReport(input), [input]);
  const w = m.window;
  const cashDelta = m.cashPrev.value > 0 ? ((m.cash.value - m.cashPrev.value) / m.cashPrev.value) * 100 : null;
  const be = m.breakEven;
  const scale = Math.max((be.bookings || 0) * be.months, be.booked, (be.target || 0) * be.months) * 1.05 || 1;
  const mark = be.bookings != null ? ((be.bookings * be.months) / scale) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <Panel icon={Wallet} title="Is the money coming in, and is it enough?" blurb="What was billed, what landed, what is late, and how long clients take to pay." lift={false}
        foot={m.cash.undated ? `${plural(m.cash.undated, 'received payment')} carry no date at all, so they are not counted in any period.` : undefined}>
        <div className="flex gap-8 items-center flex-wrap">
          <HudDial value={m.paidOnTimePct ?? 0} max={100} readout={m.paidOnTimePct == null ? '—' : pctText(m.paidOnTimePct)}
            label="Paid on time" sub={m.paidWithDates ? `within ${m.lateAfterDays} days` : 'needs received dates'} color="#059669" size={140} />
          <div className="flex-1 min-w-[280px] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Billed" value={m.billed.value} format="inr" delay={120} line={`${plural(m.billed.count, 'invoice')} raised`} />
            <Stat label="Received" value={m.cash.value} format="inr" tone="ok" delay={150}
              line={cashDelta != null ? <><b className={cashDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{cashDelta >= 0 ? '▲' : '▼'} {Math.round(Math.abs(cashDelta))}%</b> {w.compareLabel.replace(/^with /, 'on ')}</> : `${plural(m.cash.count, 'payment')}`} />
            <Stat label="Overdue" value={m.overdue.value} format="inr" tone={m.overdue.value > 0 ? 'bad' : undefined} delay={180} line={`More than ${plural(m.lateAfterDays, 'day')} unpaid`} />
            <Stat label="Days to get paid" value={m.daysToPaid} format="days" delay={210}
              line={m.daysToPaid != null && m.daysToPaidPrev != null
                ? <><b className={m.daysToPaid > m.daysToPaidPrev ? 'text-rose-700' : 'text-emerald-700'}>{m.daysToPaid > m.daysToPaidPrev ? '▲' : '▼'} {Math.abs(m.daysToPaid - m.daysToPaidPrev)} days</b> {m.daysToPaid > m.daysToPaidPrev ? 'slower' : 'faster'}</>
                : m.paidWithDates ? `from ${plural(m.paidWithDates, 'payment')}` : 'Counted from payments marked received from now on'} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={Clock} title="How late is what we are owed?" blurb={`${inr(m.unpaid)} invoiced and unpaid today, by how long it has waited.`} delay={100}
          foot="Counted from each milestone's invoice date. Work done but not yet invoiced is not here.">
          {m.unpaid <= 0 ? <Empty>Nothing invoiced is waiting to be paid.</Empty> : (
            <>
              <SplitBar delay={200} parts={m.ageing.map((a, i) => ({ key: a.label, value: a.value, color: AGE_COLOURS[i], label: a.label }))} />
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {m.ageing.map((a, i) => (
                  <div key={a.label} className="hud-row-in" style={{ animationDelay: `${300 + i * 30}ms` }}>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Swatch color={AGE_COLOURS[i]} />{a.label}</span>
                    <div className={`mt-1.5 font-black tabular-nums ${i === 3 && a.value > 0 ? 'text-rose-700' : 'text-slate-800'}`}>{inr(a.value)}</div>
                    <div className="text-[11px] text-slate-500">{plural(a.count, 'invoice')}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel icon={Users} title="Who owes the most" blurb="Overdue invoices, largest first." delay={160}
          foot="Open takes you to the project's payments, where reminders are sent from.">
          {m.debtors.length === 0 ? <Empty>No client is past the late-payment line.</Empty> : (
            <div className="flex flex-col">
              {m.debtors.slice(0, 5).map((d, i, arr) => (
                <ActionRow key={d.id} tone={d.oldestDays > 60 ? 'bad' : 'warn'} title={d.name} delay={220 + i * 30} last={i === arr.length - 1}
                  detail={`${d.invoices > 1 ? `${d.invoices} invoices · oldest ` : `${d.oldestName} · `}${plural(d.oldestDays, 'day')}`}
                  chip={<span className="text-sm font-bold tabular-nums text-slate-800">{inr(d.overdue)}</span>}
                  button={onOpenProject ? <SmallButton onClick={() => onOpenProject(d.id, 'payment-calc')}>Open payments</SmallButton> : undefined} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={Calendar} title="Cash due in the next 90 days" blurb="Milestones not yet invoiced that carry a planned date, against monthly overheads." delay={220}
          aside={m.pendingCount > 0 && m.datedCount < m.pendingCount ? <Chip tone="warn">{m.datedCount} of {m.pendingCount} dated</Chip> : undefined}
          foot={m.datedCount < m.pendingCount
            ? `${plural(m.pendingCount - m.datedCount, 'milestone')} still to bill ${m.pendingCount - m.datedCount === 1 ? 'has' : 'have'} no planned date, so ${m.pendingCount - m.datedCount === 1 ? 'it is' : 'they are'} not in these months. Set the date on each milestone in the project's payments.`
            : 'From the planned date on each milestone still to be invoiced.'}>
          <Columns delay={300} format={inr} height={140}
            line={be.overheads > 0 ? { value: be.overheads, label: `Overheads ${inr(be.overheads)} a month` } : undefined}
            months={m.due.map((d, i) => ({ key: d.key, label: monthShort(d.key), bold: i === 0, parts: [{ value: d.value, color: be.overheads > 0 && d.value < be.overheads ? '#D97706' : '#059669' }] }))} />
          <div className="mt-3 flex gap-5 text-xs text-slate-500 flex-wrap">
            {m.due.map((d) => <span key={d.key}>{monthShort(d.key)} <b className="text-slate-800 tabular-nums">{inr(d.value)}</b></span>)}
            {be.overheads > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-[1.5px] border-dashed border-slate-400" />Overheads {inr(be.overheads)} a month</span>}
          </div>
        </Panel>

        <Panel icon={Layers} title="Where the revenue comes from" blurb={`${inr(m.mix.total)} booked ${w.period === 'month' ? `in ${w.label}` : w.period === 'fy' ? 'this year' : 'in the last three months'}, by kind of work.`} delay={280}
          foot="Before GST. Scope additions count once the client has authorised them.">
          {m.mix.total <= 0 ? <Empty>Nothing booked in this period.</Empty> : (
            <>
              <SplitBar delay={340} parts={[
                { key: 'e', value: m.mix.execution, color: BRAND, label: 'Execution' },
                { key: 'd', value: m.mix.design, color: '#7C8BC9', label: 'Design fees' },
                { key: 'a', value: m.mix.additions, color: '#059669', label: 'Scope additions' },
              ]} />
              <div className="mt-4 flex flex-col">
                {[['Execution', m.mix.execution, BRAND], ['Design fees', m.mix.design, '#7C8BC9'], ['Scope additions', m.mix.additions, '#059669']].map(([l, v, c], i) => (
                  <div key={l as string} className={`hud-row-in flex items-center gap-3 py-2.5 ${i < 2 ? 'border-b border-slate-100' : ''}`} style={{ animationDelay: `${380 + i * 30}ms` }}>
                    <Swatch color={c as string} />
                    <span className="flex-1 text-xs text-slate-700">{l}</span>
                    <span className="text-xs font-bold tabular-nums text-slate-800 w-20 text-right">{inr(v as number)}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums w-10 text-right">{Math.round(((v as number) / m.mix.total) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={Percent} title="Are we keeping the margin we quoted?" blurb="Projects with purchase orders: the quoted margin against what the orders show." delay={340}
          aside={<div className="flex gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Swatch color="rgba(61,82,160,0.3)" />Quoted</span><span className="inline-flex items-center gap-1.5"><Swatch color={BRAND} />Actual</span></div>}
          foot={m.margin.measured
            ? `${m.margin.leak > 0 ? `${inr(m.margin.leak)} below` : `${inr(-m.margin.leak)} above`} what was quoted across these ${m.margin.measured}. ${m.margin.contracted - m.margin.measured > 0 ? `The other ${plural(m.margin.contracted - m.margin.measured, 'contracted project')} have no purchase orders yet, so their margin cannot be measured.` : ''}`
            : 'No contracted project has purchase orders yet, so margin cannot be measured, only quoted. Raise POs for site spend and projects join this list.'}>
          {m.margin.rows.length === 0 ? <Empty>{m.margin.quotedPct != null ? `Quoted margin across contracted work is ${pctText(m.margin.quotedPct)}.` : 'No contracted work yet.'}</Empty> : (
            <div className="flex flex-col gap-4">
              {m.margin.rows.slice(0, 6).map((r, i) => {
                const gap = r.quotedPct - r.actualPct;
                const tone = gap >= 3 ? '#E11D48' : gap >= 1 ? '#D97706' : gap <= -0.5 ? '#059669' : BRAND;
                const max = Math.max(40, ...m.margin.rows.map((x) => Math.max(x.quotedPct, x.actualPct)));
                return (
                  <button key={r.id} type="button" onClick={() => onOpenProject?.(r.id, 'materials')} className="hud-row-in text-left group" style={{ animationDelay: `${400 + i * 30}ms` }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800 group-hover:text-[#3D52A0] truncate">{r.name}</span>
                      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: gap >= 1 ? tone : gap <= -0.5 ? '#047857' : '#1e293b' }}>
                        {pctText(r.quotedPct)} → {pctText(r.actualPct)} · {r.leak > 0 ? `${inr(r.leak)} lost` : `${inr(-r.leak)} gained`}
                      </span>
                    </div>
                    <Track pct={(Math.max(0, r.quotedPct) / max) * 100} color="rgba(61,82,160,0.3)" delay={420 + i * 30} className="mt-1.5" />
                    <Track pct={(Math.max(0, r.actualPct) / max) * 100} color={tone} delay={480 + i * 30} className="mt-1" />
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel icon={LineChart} title="Are we covering the studio's costs?" blurb="Margin on work booked, against the monthly cost of running the studio." delay={400}
          aside={<Chip tone="brand">Owner only</Chip>}
          foot="Profit here is the quoted margin on work booked in the period, less overheads for the same months. A planning figure, not your accounts.">
          {be.overheads <= 0 ? (
            <Empty>
              Enter the studio's monthly overheads to see break-even and profit.
              {onSetTargets && <div className="mt-3"><SmallButton onClick={onSetTargets}>Set targets</SmallButton></div>}
            </Empty>
          ) : (
            <>
              <div className="flex gap-8 flex-wrap">
                <div>
                  <Eyebrow>Studio profit, {w.label}</Eyebrow>
                  <div className="mt-2.5"><Figure value={be.profit} format="inr" color={(be.profit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></div>
                  <div className="text-xs text-slate-500 mt-1.5">{inr(be.booked * ((be.quotedPct || 0) / 100))} margin less {inr(be.overheads * be.months)} overheads</div>
                </div>
                <div>
                  <Eyebrow>Break-even bookings</Eyebrow>
                  <div className="mt-2.5"><Figure value={be.bookings} format="inr" /></div>
                  <div className="text-xs text-slate-500 mt-1.5">a month, at {be.quotedPct != null ? pctText(be.quotedPct) : '—'} margin</div>
                </div>
              </div>
              {be.bookings != null && (
                <div className="mt-6 relative">
                  <Track pct={(be.booked / scale) * 100} color={be.booked >= be.bookings * be.months ? '#059669' : '#D97706'} delay={460} height="h-3" />
                  <div className="absolute top-[-6px] h-6 border-l-2 border-slate-800" style={{ left: `${mark}%` }} />
                  <div className="relative mt-2 h-4">
                    <span className="absolute text-[11px] font-bold text-slate-700 -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(85, Math.max(15, mark))}%` }}>
                      Break-even {inr(be.bookings * be.months)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
