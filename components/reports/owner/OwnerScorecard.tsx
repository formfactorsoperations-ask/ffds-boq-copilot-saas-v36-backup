import React, { useMemo } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Filter, Home, Percent, Target, TrendingUp, Users, Wallet } from '@/lib/lucide-shim';
import {
  scorecard, headline, actionsOf, lastSixMonths, bookedIn, cashIn, monthShort, periodWindow, inr,
  type Kpi, type OwnerReportInput,
} from '../../../lib/ownerReports';
import { Dot } from '../../ui/HudBits';
import {
  ActionRow, BRAND, Chip, Columns, DeltaChip, Empty, Eyebrow, Figure, Foot, IconChip, Panel, SmallButton, Spark, STATE_WORD, Swatch, TONE_HEX,
} from './ReportBits';

export type Section = 'scorecard' | 'sales' | 'money' | 'delivery' | 'memory';

const ICON: Record<Kpi['key'], React.ElementType> = {
  booked: TrendingUp, cash: Wallet, margin: Percent, overdue: Clock, winRate: Target, pipeline: Filter, onTime: Home, perPerson: Users,
};
const SPARK: Partial<Record<Kpi['key'], string>> = { cash: '#059669', margin: '#D97706', overdue: '#E11D48' };

const KpiTile: React.FC<{ k: Kpi; compare: string; delay: number; onOpen: () => void; onSetTargets?: () => void }> = ({ k, compare, delay, onOpen, onSetTargets }) => (
  <div className="rp-frame rp-panel hud-panel-in bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
    <button type="button" onClick={onOpen} className="text-left p-5 flex-1 flex flex-col justify-start cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30"
      aria-label={`${k.label}: open ${k.section === 'sales' ? 'Sales' : k.section === 'money' ? 'Money' : 'Delivery and team'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <IconChip icon={ICON[k.key]} />
          <Eyebrow className="truncate">{k.label}</Eyebrow>
        </span>
        <Chip tone={k.state}>{STATE_WORD[k.state]}</Chip>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Figure value={k.value} format={k.format} color={k.key === 'overdue' && (k.value || 0) > 0 ? 'text-rose-700' : 'text-slate-800'} />
          <div className="text-xs text-slate-500 mt-1.5">{k.line}</div>
        </div>
        <Spark values={k.spark} color={SPARK[k.key] || BRAND} />
      </div>
      {k.delta && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <DeltaChip delta={k.delta} />
          <span className="text-[11px] text-slate-500">{k.key === 'margin' ? 'against what was quoted' : k.key === 'overdue' ? 'since the period began' : compare}</span>
        </div>
      )}
      <div className="mt-3.5">
        {k.bar ? (
          <>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="rp-hbar h-full rounded-full" style={{ width: `${k.bar.pct}%`, background: k.state === 'none' ? BRAND : TONE_HEX[k.state], animationDelay: `${delay + 200}ms` }} />
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">{k.bar.text}</div>
          </>
        ) : (
          <div className="text-[11px] text-slate-500">
            {k.state === 'none' && (k.key === 'booked' || k.key === 'cash' || k.key === 'perPerson') ? 'No target set yet.' : ' '}
          </div>
        )}
      </div>
    </button>
    {k.state === 'none' && onSetTargets && (k.key === 'booked' || k.key === 'cash' || k.key === 'perPerson') && (
      <div className="px-5 -mt-2 pb-3">
        <button type="button" onClick={onSetTargets} className="text-xs font-bold text-[#3D52A0] hover:text-[#334486]">Set a target</button>
      </div>
    )}
    <Foot>{k.how}</Foot>
  </div>
);

export default function OwnerScorecard({ input, onSection, onOpenProject, onSetTargets }: {
  input: OwnerReportInput;
  onSection: (s: Section) => void;
  onOpenProject?: (id: string, tab?: string) => void;
  onSetTargets?: () => void;
}) {
  const w = periodWindow(input.period, input.now);
  const kpis = useMemo(() => scorecard(input), [input]);
  const head = useMemo(() => headline(input, kpis), [input, kpis]);
  const actions = useMemo(() => actionsOf(input), [input]);
  const months = useMemo(() => lastSixMonths(input.now).map((m) => ({
    key: m.key, booked: bookedIn(input.facts, m.range).value, cash: cashIn(input.facts, m.range).value,
  })), [input]);
  const totBooked = months.reduce((s, m) => s + m.booked, 0);
  const totCash = months.reduce((s, m) => s + m.cash, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className={`hud-panel-in rounded-2xl border px-4 py-3 flex items-start gap-2.5 ${head.tone === 'ok' ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
        {head.tone === 'ok'
          ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" strokeWidth={2.3} />
          : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" strokeWidth={2.3} />}
        <p className="text-sm leading-relaxed text-slate-800">{head.text}</p>
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
        <div>
          <h3 className="font-bold text-slate-800">The eight numbers to run the studio by</h3>
          <p className="text-xs text-slate-500 mt-0.5">Each against its target and the period before. Open a card for the section behind it.</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><Dot tone="ok" />On track</span>
          <span className="inline-flex items-center gap-1.5"><Dot tone="warn" />Watch</span>
          <span className="inline-flex items-center gap-1.5"><Dot tone="bad" live />Act now</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <KpiTile key={k.key} k={k} compare={w.compareLabel} delay={40 + i * 60} onOpen={() => onSection(k.section)} onSetTargets={onSetTargets} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        <Panel icon={CheckCircle2} title="Three things worth doing this week" blurb="Picked from the numbers above, largest rupee value first." delay={520} lift={false}>
          {actions.length === 0 ? (
            <Empty>Nothing on the scorecard needs action this week.</Empty>
          ) : (
            <div className="flex flex-col">
              {actions.map((a, i) => (
                <ActionRow key={a.title} tone={a.tone} title={a.title} detail={a.detail} delay={600 + i * 30} last={i === actions.length - 1}
                  chip={<Chip tone={a.stake != null ? (a.tone === 'bad' ? 'bad' : 'warn') : 'none'}>{a.chip}</Chip>}
                  button={
                    <SmallButton onClick={() => (a.go.projectId && onOpenProject ? onOpenProject(a.go.projectId, a.go.tab) : onSection(a.go.section))}>
                      {a.go.projectId ? 'Open' : a.go.section === 'sales' ? 'Open Sales' : 'Open'}
                    </SmallButton>
                  } />
              ))}
            </div>
          )}
        </Panel>

        <Panel icon={BarChart3} title="Booked against received" delay={580} lift={false}
          blurb={input.targets.bookingsMonthly ? `The last six months, with the ${inr(input.targets.bookingsMonthly)} monthly target.` : 'The last six months.'}
          foot="Booked is the month a proposal was accepted. Received is the month the money landed. A booking is paid over many months, so received trails booked.">
          <Columns grouped delay={640} format={inr}
            line={input.targets.bookingsMonthly ? { value: input.targets.bookingsMonthly, label: `Target ${inr(input.targets.bookingsMonthly)}` } : undefined}
            months={months.map((m, i) => ({ key: m.key, label: monthShort(m.key), bold: i === months.length - 1, parts: [{ value: m.booked, color: BRAND }, { value: m.cash, color: '#059669' }] }))} />
          <div className="mt-4 flex items-center gap-5 flex-wrap text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Swatch color={BRAND} />Booked <b className="text-slate-800 tabular-nums">{inr(totBooked)}</b></span>
            <span className="inline-flex items-center gap-1.5"><Swatch color="#059669" />Received <b className="text-slate-800 tabular-nums">{inr(totCash)}</b></span>
            {input.targets.bookingsMonthly ? <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-[1.5px] border-dashed border-slate-400" />Target</span> : null}
            {totBooked > totCash && <span>Gap <b className="text-amber-700 tabular-nums">{inr(totBooked - totCash)}</b> still to come in</span>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
