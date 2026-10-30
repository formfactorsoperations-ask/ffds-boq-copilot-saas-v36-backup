import React from 'react';
import {
  Target, CheckSquare, Flag, LineChart, Layers, Users, Filter, Clock, SlidersHorizontal, CalendarDays, LayoutGrid, Wallet, ShieldCheck,
} from '@/lib/lucide-shim';
import { CountUp } from '../../ui/HudBits';
import { inr } from '../../../lib/ownerReports';
import {
  BANDS, TIERS, monthName, shortDate, type FounderPlan, type GoalsReport, type Tier, type Band, type CostLine, type Funnel,
} from '../../../lib/founderGoals';
import { Panel, Chip, Eyebrow, Track, Swatch, ActionRow, SmallButton, Empty, BRAND, TONE_HEX } from './ReportBits';
import { NumInput } from './GoalsInputs';

/*
  FOUNDERS' GOALS: the tab only the two founders see (lib/founderGoals has the
  arithmetic and who they are). From the mockup approved on 30 Oct 2026: where
  the quarter stands, what to do this week, then the goal, runway, projects,
  team, leads, pipeline, levers and the year, and the founders' assumptions at
  the bottom, which every figure above follows as they type.
*/

const HOME = '#7C8BC9';
const one = (v: number) => String(Math.round(v * 10) / 10);
const plural = (k: number, a: string, b = `${a}s`) => `${k} ${k === 1 ? a : b}`;
const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0))}%`;
const money = (v: number) => inr(v);

const Tile: React.FC<{ label: string; delay?: number; children: React.ReactNode; line?: React.ReactNode; className?: string }> = ({ label, delay = 0, children, line, className = '' }) => (
  <div className={`hud-row-in rounded-xl border border-slate-200 p-4 min-w-0 flex flex-col ${className}`} style={{ animationDelay: `${delay}ms` }}>
    <Eyebrow>{label}</Eyebrow>
    <div className="mt-2.5">{children}</div>
    {line && <div className="text-xs text-slate-500 mt-1.5">{line}</div>}
  </div>
);
const Big: React.FC<{ v: number; f?: (v: number) => string; color?: string; size?: string; suffix?: string }> = ({ v, f = money, color = 'text-slate-800', size = 'text-3xl', suffix }) => (
  <span className={`${size} ${color} leading-none font-black tabular-nums`}>
    <CountUp value={v} format={f} />
    {suffix && <span className="text-sm font-bold text-slate-500 ml-1">{suffix}</span>}
  </span>
);
const Legend: React.FC<{ items: { color: string; label: React.ReactNode; dashed?: boolean; mark?: boolean }[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
    {items.map((x, k) => (
      <span key={k} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        {x.mark ? <span className="w-0.5 h-3 rounded" style={{ background: x.color }} />
          : x.dashed ? <span className="w-3 border-t-[1.5px] border-dashed" style={{ borderColor: x.color }} />
          : <Swatch color={x.color} />}
        {x.label}
      </span>
    ))}
  </div>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-500 leading-relaxed">{children}</div>
);

/* ── Where the quarter stands ───────────────────────────────────────────── */

function Hero({ r }: { r: GoalsReport }) {
  const q = r.quarter;
  const short = r.gap > 0;
  const runOut = r.runwayOut.none;
  const runMonths = runOut != null ? (runOut - r.now) / (30.44 * 86400000) : null;
  return (
    <Panel icon={Target} lift={false}
      title={`${q.label} is on course for ${money(r.projected)}, ${money(Math.abs(r.gap))} ${short ? 'short of' : 'past'} the ${r.tierName} goal`}
      blurb={`Break even is ${money(r.qCosts)}${r.gapBreakEven > 0 ? `, still ${money(r.gapBreakEven)} away` : ', already covered'}. ${short && r.crackNow ? `${plural(r.crackNow, 'typical project')} signed in the next fortnight close the gap; the open pipeline is likely to bring ${money(r.pipeWeighted)}.` : 'Projects signed from now on count towards next quarter.'}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Tile label="This quarter's goal" delay={80}
          line={r.tier === 'survive' ? `${money(r.monthly)} a month of costs, × 3`
            : r.cash == null ? `Costs${r.tier === 'grow' ? `, plus ${money(r.growthQ)} profit` : ''}; the buffer part needs the cash figure`
            : r.tier === 'sustain' ? `Costs, plus ${money(r.rebuildQ)} to rebuild the buffer` : `Costs, buffer, plus ${money(r.growthQ)} profit`}>
          <Big v={r.goal} />
        </Tile>
        <Tile label="Will end the quarter at" delay={110} line={`${money(r.earned)} earned, ${money(r.expected)} still to land from signed work`}>
          <Big v={r.projected} color={short ? 'text-amber-700' : 'text-emerald-700'} />
        </Tile>
        <Tile label="Runway" delay={140}
          line={r.cash == null ? 'Enter cash in Cash and safety below' : runOut == null ? 'Cash and signed work cover the next 12 months' : `If nothing new signs, cash runs out in ${monthName(runOut)}`}>
          {r.cash == null ? <span className="text-3xl font-black text-slate-400 leading-none">—</span>
            : runMonths == null ? <span className="text-3xl font-black text-slate-800 leading-none">12+ mo</span>
            : <Big v={runMonths} f={(v) => `${one(v)} mo`} color={runMonths < 6 ? 'text-rose-700' : 'text-slate-800'} />}
        </Tile>
        <Tile label="Projects to sign" delay={170} line={`About ${r.perQGoal} a quarter${r.crackNow ? `; ${r.crackNow} more soon for ${q.label}` : ''}`}>
          <Big v={r.perYear[r.tier]} f={(v) => String(Math.round(v))} suffix="a year" />
        </Tile>
        <Tile label="Leads a month" delay={200}
          line={r.extraLeads > 0 ? `${r.extraLeads} more a month for the goal${r.perPaidLead ? `, about ${money(r.extraLeads * r.perPaidLead)} more marketing` : ''}` : 'Enough for the goal'}>
          <Big v={r.leadsHave} f={one} color={r.extraLeads > 0 ? 'text-amber-700' : 'text-emerald-700'} suffix={`of ${r.leadsNeed}`} />
        </Tile>
      </div>
      <div className="mt-5">
        <div className="relative">
          <div className="flex h-3.5 rounded-full overflow-hidden bg-slate-100">
            <div className="rp-hbar h-full" style={{ width: pct(r.earned, r.goal), background: TONE_HEX.ok }} />
            <div className="rp-hbar h-full" style={{ width: pct(r.expected, r.goal), background: 'rgba(5,150,105,0.3)', animationDelay: '120ms' }} />
          </div>
          {r.qCosts < r.goal && <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-800" style={{ left: pct(r.qCosts, r.goal) }} title="Break even" />}
        </div>
        <div className="mt-2">
          <Legend items={[
            { color: TONE_HEX.ok, label: `Earned, ${Math.round((r.earned / (r.goal || 1)) * 100)}% of the goal` },
            { color: 'rgba(5,150,105,0.3)', label: 'Still to land from projects already signed' },
            ...(r.qCosts < r.goal ? [{ color: '#1e293b', label: `Break even at ${money(r.qCosts)}`, mark: true }] : []),
          ]} />
        </div>
      </div>
    </Panel>
  );
}

function Moves({ r }: { r: GoalsReport }) {
  return (
    <Panel icon={CheckSquare} lift={false} delay={40} title="What to do about it this week" blurb="Worked out from the numbers below, most urgent first. They change as the numbers do.">
      {r.moves.length === 0 ? <Empty>Nothing needs you this week: the goal is covered and the team can carry it.</Empty> : (
        <div className="-mt-2">
          {r.moves.map((m, k) => (
            <ActionRow key={m.title} tone={m.tone === 'brand' ? 'none' : m.tone} title={m.title} detail={m.line} delay={80 + k * 40} last={k === r.moves.length - 1}
              chip={<Chip tone={m.tone}>{m.tag}</Chip>} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── The goal, and runway ───────────────────────────────────────────────── */

function GoalLevel({ r, onTier }: { r: GoalsReport; onTier: (t: Tier) => void }) {
  const parts = [
    { key: 'studio', color: BRAND, label: 'Studio', value: r.studioTotal * 3 },
    { key: 'home', color: HOME, label: 'Household', value: r.homeTotal * 3 },
    { key: 'buffer', color: TONE_HEX.warn, label: 'Rebuild buffer', value: r.tier === 'survive' ? 0 : r.rebuildQ },
    { key: 'profit', color: TONE_HEX.ok, label: 'Profit', value: r.tier === 'grow' ? r.growthQ : 0 },
  ];
  const cashMonths = r.cash != null && r.monthly ? r.cash / r.monthly : null;
  return (
    <Panel icon={Flag} delay={80} title="What should the goal be?" blurb="Three levels, each built on the one before. Pick one: projects and leads below follow it."
      foot={r.cash == null ? 'Enter cash below and the app recommends a level.' : r.recommended === 'sustain'
        ? `Sustain is recommended: cash covers ${one(cashMonths || 0)} months of costs and the safety buffer is ${r.bufferTarget && r.monthly ? one(r.bufferTarget / r.monthly) : 0} months. Once it is rebuilt, the recommendation moves to Grow.`
        : 'Grow is recommended: the safety buffer is full, so profit can be saved or put back into the studio.'}>
      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Goal level">
        {TIERS.map((t, k) => {
          const on = t.key === r.tier;
          return (
            <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => onTier(t.key)}
              className={`hud-row-in w-full text-left rounded-xl border px-4 py-3 flex items-center gap-3.5 transition-[border-color,box-shadow] ${on ? 'border-[#3D52A0] ring-[3px] ring-[#3D52A0]/10' : 'border-slate-200 hover:border-slate-300'}`}
              style={{ animationDelay: `${120 + k * 40}ms` }}>
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-[#3D52A0]' : 'border-slate-300'}`}>
                {on && <span className="w-2 h-2 rounded-full bg-[#3D52A0]" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 flex-wrap"><span className="text-sm font-bold text-slate-800">{t.name}</span>{t.key === r.recommended && r.cash != null && <Chip tone="ok">Recommended</Chip>}</span>
                <span className="block text-xs text-slate-500">{t.line}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-lg font-black text-slate-800 tabular-nums">{money(r.tierVal[t.key])}</span>
                <span className="text-[11px] text-slate-500">{r.perYear[t.key]} projects a year</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        <Eyebrow>How the {r.tierName} goal adds up, a quarter</Eyebrow>
        <div className="mt-2 flex h-3 rounded-full overflow-hidden bg-slate-100">
          {parts.filter((p) => p.value > 0).map((p, k) => (
            <div key={p.key} className="rp-hbar h-full" style={{ width: pct(p.value, r.goal), background: p.color, animationDelay: `${k * 110}ms` }} title={`${p.label}: ${money(p.value)}`} />
          ))}
        </div>
        <div className="mt-2"><Legend items={parts.map((p) => ({ color: p.color, label: `${p.label} ${money(p.value)}` }))} /></div>
      </div>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Projects a quarter" line={`${r.perQ.survive} just to break even`}><Big v={r.perQGoal} f={(v) => String(Math.round(v))} size="text-xl" /></Tile>
        <Tile label="Leads a month" line={`The last three months averaged ${one(r.leadsHave)}`}><Big v={r.leadsNeed} f={(v) => String(Math.round(v))} size="text-xl" color={r.extraLeads > 0 ? 'text-amber-700' : 'text-slate-800'} /></Tile>
        <Tile label="Buffer full by"
          line={r.cash == null ? 'Needs the cash figure' : r.cash >= r.bufferTarget ? 'Cash covers the buffer' : r.bufferBy.goal ? "At this level's pace" : r.tier === 'survive' ? 'Break even never rebuilds it' : 'Not within a year at this pace'}>
          <span className="text-xl font-black text-slate-800 leading-none">
            {r.cash == null ? '—' : r.cash >= r.bufferTarget ? 'Full now' : r.bufferBy.goal ? shortMonth(r.bufferBy.goal) : 'Not this year'}
          </span>
        </Tile>
      </div>
    </Panel>
  );
}
const shortMonth = (t: number) => { const d = new Date(t); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${String(d.getFullYear() % 100).padStart(2, '0')}`; };

function Runway({ r }: { r: GoalsReport }) {
  const pts = r.runway;
  const head = (
    <div className="text-right">
      <Eyebrow>Cash today</Eyebrow>
      <div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{r.cash == null ? '—' : money(r.cash)}</div>
      <div className="text-[11px] text-slate-500">{r.cash != null && r.monthly ? `${one(r.cash / r.monthly)} months of costs` : 'Not entered yet'}</div>
    </div>
  );
  if (!pts) {
    return (
      <Panel icon={LineChart} delay={120} title="Runway: how long the cash lasts" blurb="Cash at the end of each month for the next year, at three paces of signing." aside={head}>
        <Empty>Runway needs one figure the app cannot see: the cash the studio can spend. Enter it in Cash and safety at the bottom of this tab.</Empty>
      </Panel>
    );
  }
  const all = pts.flatMap((p) => [p.none, p.pace, p.goal]).concat([r.bufferTarget, 0]);
  const hi = Math.max(...all), lo = Math.min(...all);
  const y = (v: number) => 10 + ((hi - v) / ((hi - lo) || 1)) * 200;
  const x = (k: number) => (k * 640) / (pts.length - 1);
  const path = (key: 'none' | 'pace' | 'goal') => pts.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const signedEnds = r.signedEnds ? monthName(r.signedEnds).split(' ')[0] : null;
  const rows = [
    { color: TONE_HEX.bad, key: 'none' as const, name: 'If nothing new signs',
      line: r.runwayOut.none ? `${signedEnds ? `Signed work finishes in ${signedEnds}; ` : ''}cash runs out in ${monthName(r.runwayOut.none)}` : 'Signed work and cash cover the next 12 months',
      tone: r.runwayOut.none && (r.runwayOut.none - r.now) < 6 * 30.44 * 86400000 ? 'bad' as const : 'warn' as const,
      state: r.runwayOut.none ? `${one((r.runwayOut.none - r.now) / (30.44 * 86400000))} months` : '12+ months' },
    { color: TONE_HEX.warn, key: 'pace' as const, name: "At today's lead flow",
      line: `About ${one(r.pacePerQ)} signings a quarter. ${r.runwayOut.pace ? `Cash runs out in ${monthName(r.runwayOut.pace)}` : r.bufferBy.pace ? `Buffer rebuilt by ${monthName(r.bufferBy.pace)}` : r.cash >= r.bufferTarget ? `Cash ends the year at ${money(pts[pts.length - 1].pace)}` : `Cash ends the year at ${money(pts[pts.length - 1].pace)}, short of the buffer`}`,
      tone: r.runwayOut.pace ? 'bad' as const : r.bufferBy.pace || r.cash >= r.bufferTarget ? 'ok' as const : 'warn' as const,
      state: r.runwayOut.pace ? `${one((r.runwayOut.pace - r.now) / (30.44 * 86400000))} months` : r.bufferBy.pace || r.cash >= r.bufferTarget ? 'Safe' : 'Holds, no buffer' },
    { color: BRAND, key: 'goal' as const, name: `On the ${r.tierName} goal's pace`,
      line: `${plural(r.perQGoal, 'signing')} a quarter. ${r.runwayOut.goal ? `Cash runs out in ${monthName(r.runwayOut.goal)}` : r.bufferBy.goal ? `Buffer rebuilt by ${monthName(r.bufferBy.goal)}` : `Cash ends the year at ${money(pts[pts.length - 1].goal)}`}`,
      tone: r.runwayOut.goal ? 'bad' as const : 'ok' as const, state: r.runwayOut.goal ? 'Runs out' : 'Safe' },
  ];
  return (
    <Panel icon={LineChart} delay={120} title="Runway: how long the cash lasts" blurb="Cash at the end of each month for the next year, at three paces of signing." aside={head}
      foot={`The dashed line is the safety buffer: ${one(r.monthly ? r.bufferTarget / r.monthly : 0)} months of costs, ${money(r.bufferTarget)}. Signed work lands as planned; new projects at the typical size from your mix.`}>
      <svg viewBox="0 0 640 220" width="100%" height={220} preserveAspectRatio="none" role="img" aria-label="Cash for the next twelve months" className="block overflow-visible">
        <rect x={0} y={y(0)} width={640} height={Math.max(0, 220 - y(0))} fill="rgba(225,29,72,0.06)" />
        <line x1={0} x2={640} y1={y(0)} y2={y(0)} stroke={TONE_HEX.bad} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={640} y1={y(r.bufferTarget)} y2={y(r.bufferTarget)} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {rows.map((row, k) => (
          <path key={row.key} d={path(row.key)} pathLength={100} fill="none" stroke={row.color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            className="rp-line" style={{ ['--rp-len' as any]: 100, animationDelay: `${k * 160}ms` }} />
        ))}
      </svg>
      <div className="mt-2 flex justify-between">
        {pts.map((p, k) => (
          <span key={p.at} className="w-0 flex justify-center whitespace-nowrap text-[11px] text-slate-500">{k === 0 ? 'Now' : k % 2 && pts.length > 8 ? '' : shortMonth(p.at).split(' ')[0]}</span>
        ))}
      </div>
      <div className="mt-4">
        {rows.map((row, k) => (
          <div key={row.key} className={`hud-row-in flex items-center gap-3 py-2.5 ${k < rows.length - 1 ? 'border-b border-slate-100' : ''}`} style={{ animationDelay: `${200 + k * 40}ms` }}>
            <span className="w-3.5 h-[3px] rounded shrink-0" style={{ background: row.color }} />
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-slate-800">{row.name}</div><div className="text-[11px] text-slate-500">{row.line}</div></div>
            <Chip tone={row.tone}>{row.state}</Chip>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Projects, and the team ─────────────────────────────────────────────── */

function Projects({ r }: { r: GoalsReport }) {
  const max = Math.max(1, ...r.alone.map((a) => a.n));
  return (
    <Panel icon={Layers} delay={160} title="How many projects to sign" blurb={`A typical project from your mix: ${money(r.avgValue)}, ${money(r.avgMargin)} margin over ${one(r.avgMonths)} months.`}
      foot="Over a year every project's margin lands in full, so the count is the year's goal over a typical project's margin. Bigger projects mean fewer to win, but each takes longer to pay out.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="To break even" line={`About ${r.perQ.survive} a quarter`}><Big v={r.perYear.survive} f={(v) => String(Math.round(v))} size="text-2xl" suffix="a year" /></Tile>
        <Tile label={`For the ${r.tierName} goal`} className="!border-[#3D52A0]" line={`About ${r.perQGoal} a quarter, ${one(r.signMonth)} a month`}><Big v={r.perYear[r.tier]} f={(v) => String(Math.round(v))} size="text-2xl" suffix="a year" /></Tile>
        <Tile label={`Signed so far in ${r.fy.label}`} line={r.fySigned >= r.fyDue ? "On pace for the year so far" : `${r.fyDue - r.fySigned} behind the year's pace`}>
          <Big v={r.fySigned} f={(v) => String(Math.round(v))} size="text-2xl" color={r.fySigned >= r.fyDue ? 'text-emerald-700' : 'text-amber-700'} suffix={`of ${r.fyDue} due by now`} />
        </Tile>
      </div>
      <div className="mt-5">
        <Eyebrow>Or the {r.tierName} goal from one size alone, a quarter</Eyebrow>
        <div className="mt-2.5 flex flex-col gap-2">
          {r.alone.map((a, k) => (
            <div key={a.label} className="hud-row-in grid grid-cols-[96px_1fr_88px] gap-3 items-center" style={{ animationDelay: `${200 + k * 40}ms` }}>
              <span className="text-xs text-slate-700">{a.label}</span>
              <Track pct={(a.n / max) * 100} height="h-2" delay={240 + k * 40} />
              <span className="text-xs font-bold text-slate-800 tabular-nums text-right">{plural(a.n, 'project')}</span>
            </div>
          ))}
        </div>
      </div>
      <Note>{r.gap > 0
        ? `This quarter: ${money(r.gap)} still to find. A typical project signed in the next fortnight lands ${money(r.landsNow)} before ${shortDate(r.quarter.end - 86400000)}, so it takes ${r.crackNow || 'more than this quarter has left'}. One signed later lands far less.`
        : "This quarter's goal is covered by signed work. Signings from now on build the next quarter."}</Note>
    </Panel>
  );
}

function Team({ r }: { r: GoalsReport }) {
  const t = r.team;
  const row = (role: string, have: number, people: number, per: number, unit: string) => {
    const cap = people * per;
    const over = have > cap;
    return { role, line: `${have} ${unit} on ${plural(people, 'person', 'people')}, who carry ${per} each`, w: cap ? (have / Math.max(cap, have)) * 100 : 100,
      color: over ? TONE_HEX.bad : cap && have / cap > 0.85 ? TONE_HEX.warn : TONE_HEX.ok,
      tone: over ? 'bad' as const : have === cap ? 'warn' as const : 'ok' as const, state: over ? `${have - cap} over` : have === cap ? 'Full' : `Room for ${cap - have}` };
  };
  const rows = [row('Designers', r.live, t.designers, t.perDesigner, plural(r.live, 'live project').split(' ').slice(1).join(' ')), row('Site Supervisors', r.sites, t.supervisors, t.perSupervisor, plural(r.sites, 'live site').split(' ').slice(1).join(' '))];
  return (
    <Panel icon={Users} delay={200} title="Can the team carry it?" blurb={`At ${one(r.signMonth)} signings a month and ${one(r.avgMonths)} months each, about ${Math.round(r.liveAtGoal)} projects run at once.`}
      foot="People come from Studio settings → Team; what one person carries, from Set targets.">
      <div className="flex flex-col gap-4">
        {rows.map((x, k) => (
          <div key={x.role} className="hud-row-in" style={{ animationDelay: `${200 + k * 40}ms` }}>
            <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold text-slate-800">{x.role}</span><Chip tone={x.tone}>{x.state}</Chip></div>
            <div className="text-xs text-slate-500 mt-0.5">{x.line}</div>
            <Track pct={x.w} color={x.color} height="h-2" className="mt-2" delay={240 + k * 40} />
          </div>
        ))}
      </div>
      <Note>
        At the goal's pace you need {plural(r.needDesigners, 'Designer')} (you have {t.designers}) and {plural(r.needSupervisors, 'Site Supervisor')} (you have {t.supervisors}).
        {r.needSupervisors > t.supervisors ? ' Plan a Site Supervisor before signing more site work.' : r.needDesigners > t.designers ? ' Plan another Designer before the pace picks up.' : ' The team can carry it.'}
      </Note>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Tile label="What a hire costs" line={r.hireCost ? `Today's average salary, ${money(r.hireCost * 3)} a quarter` : 'Add a studio cost named Salaries to see this'}>
          {r.hireCost ? <Big v={r.hireCost} size="text-xl" suffix="a month" /> : <span className="text-xl font-black text-slate-400">—</span>}
        </Tile>
        <Tile label="Pays for itself with" line={`A typical project's ${money(r.avgMargin)} margin`}>
          {r.hireCost && r.avgMargin ? <span className="text-xl font-black text-slate-800 leading-none">1 project<span className="text-sm font-bold text-slate-500 ml-1">every {Math.max(1, Math.round(r.avgMargin / r.hireCost))} months</span></span> : <span className="text-xl font-black text-slate-400">—</span>}
        </Tile>
      </div>
    </Panel>
  );
}

/* ── Leads, worked backwards ────────────────────────────────────────────── */

function Leads({ r, leadsRead }: { r: GoalsReport; leadsRead: boolean }) {
  const f = r.funnel;
  const steps = [
    { name: 'Leads', rate: `${f.referral}% from referrals`, have: r.leadsHave, need: r.need.leads },
    { name: 'First meetings', rate: `${f.meet}% of leads`, have: r.actual.meetings, need: r.need.meetings },
    { name: 'Proposals', rate: `${f.prop}% of meetings`, have: r.actual.proposals, need: r.need.proposals },
    { name: 'Signed', rate: `${f.win}% of proposals`, have: r.actual.signed, need: r.need.signed },
  ];
  const aside = (
    <div className="text-right">
      <Eyebrow>Lead to signed</Eyebrow>
      <div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{one(r.conv * 100)}%</div>
      <div className="text-[11px] text-slate-500">{r.conv ? `1 in ${Math.round(1 / r.conv)} leads becomes a project` : 'Set the rates below'}</div>
    </div>
  );
  return (
    <Panel icon={Filter} lift={false} delay={240} title="Leads, worked backwards from the goal" aside={aside}
      blurb={`${one(r.signMonth)} signings a month needs this many at each step, at your usual rates. Bars show the last three months, a month on average.`}
      foot={leadsRead
        ? `Rates come from ${plural(r.funnelBasedOn, 'actual lead')} in the last 12 months${r.funnelBasedOn < 5 ? ': too few yet, so the sheet\'s rates stand in' : ''}. Referrals and repeat clients count as free leads. Leads tied to a Dummy project are left out.`
        : 'The leads could not be read, so the rates are the sheet\'s and the bars are empty.'}>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[150px_1fr_110px_96px] gap-4 pb-2 border-b border-slate-100">
            <Eyebrow>Step</Eyebrow><Eyebrow>Have against need, a month</Eyebrow><Eyebrow className="text-right">Have / need</Eyebrow><span />
          </div>
          {steps.map((s, k) => {
            const top = Math.max(s.have, s.need) * 1.1 || 1;
            const ok = s.have >= s.need - 0.05;
            return (
              <div key={s.name} className="hud-row-in grid grid-cols-[150px_1fr_110px_96px] gap-4 items-center py-3 border-b border-slate-100 last:border-0" style={{ animationDelay: `${280 + k * 40}ms` }}>
                <div><div className="text-sm font-semibold text-slate-800">{s.name}</div><div className="text-[11px] text-slate-500">{s.rate}</div></div>
                <div className="relative h-3 rounded-full bg-slate-100">
                  <div className="rp-hbar absolute inset-y-0 left-0 rounded-full" style={{ width: pct(s.have, top), background: ok ? TONE_HEX.ok : TONE_HEX.warn, animationDelay: `${320 + k * 40}ms` }} />
                  <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-800" style={{ left: pct(s.need, top) }} title={`Need ${one(s.need)}`} />
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums text-right">{one(s.have)} / {one(s.need)}</span>
                <span className="justify-self-end"><Chip tone={ok ? 'ok' : s.have / (s.need || 1) < 0.75 ? 'bad' : 'warn'}>{ok ? 'On pace' : `${one(s.need - s.have)} short`}</Chip></span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile label="Last day for a lead to sign this quarter" line={`Lead to signing takes ${Math.round(f.cycle)} days on average. Leads after this fill next quarter.`}>
          <span className="text-xl font-black text-slate-800 leading-none">{r.cutoff > r.now ? shortDate(r.cutoff) : 'Passed'}</span>
        </Tile>
        <Tile label="What a lead costs"
          line={r.perPaidLead ? `${money(r.marketing)} marketing a month over ${one(r.leadsHave * (1 - f.referral / 100))} paid leads. A signed project costs about ${money(r.conv ? r.perPaidLead / r.conv : 0)} in marketing.` : 'Add a studio cost named Marketing to see this.'}>
          {r.perPaidLead ? <Big v={r.perPaidLead} size="text-xl" /> : <span className="text-xl font-black text-slate-400">—</span>}
        </Tile>
        <Tile label="At today's lead flow"
          line={r.pacePerQ >= r.perQGoal ? 'Enough leads for the goal.' : `Signings a quarter, against ${r.perQGoal} the goal needs. ${r.pacePerQ >= r.perQ.survive ? 'Enough to break even, not more.' : 'Not enough to break even.'}`}>
          <Big v={r.pacePerQ} f={one} size="text-xl" color={r.pacePerQ >= r.perQGoal ? 'text-emerald-700' : 'text-amber-700'} suffix="a quarter" />
        </Tile>
      </div>
    </Panel>
  );
}

/* ── Pipeline and levers ────────────────────────────────────────────────── */

function Pipeline({ r, onOpenProject }: { r: GoalsReport; onOpenProject: (id: string) => void }) {
  const still = r.gap - r.pipeWeighted;
  const first = r.pipe.find((p) => p.count === 1 && p.land > 0);
  const aside = (
    <div className="text-right">
      <Eyebrow>Likely, at usual odds</Eyebrow>
      <div className={`mt-1.5 text-2xl font-black tabular-nums ${r.pipeWeighted >= r.gap ? 'text-emerald-700' : 'text-amber-700'}`}>{money(r.pipeWeighted)}</div>
      <div className="text-[11px] text-slate-500">against {money(Math.max(0, r.gap))} to find</div>
    </div>
  );
  return (
    <Panel icon={Clock} delay={280} title={`Can the pipeline close ${r.quarter.label}?`} blurb={`Open proposals and leads, with what each lands before ${shortDate(r.quarter.end - 86400000)} if it signs on time.`}
      foot="Odds are the studio's own win rate for a proposal, and 60% or better once negotiating. A long project lands only part of its margin before the quarter ends.">
      <div className="flex justify-end -mt-2 mb-2">{aside}</div>
      {r.pipe.length === 0 ? <Empty>No open proposals on actual projects, and no leads past a first meeting. Every signing this quarter has to start as a new lead.</Empty> : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[520px]">
            <thead><tr className="text-left">
              {['Proposal or lead', 'Stage', 'Value', 'Lands in time', 'Odds', ''].map((h) => <th key={h} className="px-2 py-2 border-b border-slate-100"><Eyebrow>{h}</Eyebrow></th>)}
            </tr></thead>
            <tbody>
              {r.pipe.slice(0, 8).map((p, k) => (
                <tr key={p.id} className="hud-row-in" style={{ animationDelay: `${300 + k * 40}ms` }}>
                  <td className="px-2 py-3 border-b border-slate-100">
                    {p.id === 'leads' ? <span className="font-semibold text-slate-800">{p.name}</span>
                      : <button type="button" className="font-semibold text-slate-800 hover:text-[#3D52A0] text-left" onClick={() => onOpenProject(p.id)}>{p.name}</button>}
                    <div className="text-[11px] text-slate-500">Signs by about {shortDate(p.signsBy)}</div>
                  </td>
                  <td className="px-2 py-3 border-b border-slate-100 text-slate-700">{p.stage}</td>
                  <td className="px-2 py-3 border-b border-slate-100 text-slate-700 tabular-nums">{p.count > 1 ? `${p.count} × ~${money(p.value)}` : money(p.value)}</td>
                  <td className="px-2 py-3 border-b border-slate-100 font-bold text-slate-800 tabular-nums">{p.land > 0 ? money(p.land) : '–'}</td>
                  <td className="px-2 py-3 border-b border-slate-100 text-slate-700 tabular-nums">{Math.round(p.odds * 100)}%</td>
                  <td className="px-2 py-3 border-b border-slate-100 text-right">
                    <Chip tone={p.land <= 0 ? 'none' : r.gap > 0 && p.land >= r.gap ? 'ok' : r.gapBreakEven > 0 && p.land >= r.gapBreakEven ? 'ok' : 'warn'}>
                      {p.land <= 0 ? 'Next quarter' : r.gap > 0 && p.land >= r.gap ? 'Closes the gap' : r.gapBreakEven > 0 && p.land >= r.gapBreakEven ? 'Covers break even' : 'Helps'}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Note>{r.gap <= 0 ? 'The goal is already covered by signed work; the pipeline is profit on top.'
        : `${first && r.gapBreakEven > 0 && first.land >= r.gapBreakEven ? `${first.name} alone covers break even (${money(r.gapBreakEven)} to go). ` : ''}At usual odds the pipeline brings ${money(r.pipeWeighted)}${still > 0 ? `, leaving ${money(still)} of the ${r.tierName} goal to find: sign more than one of these${r.cutoff > r.now ? `, or a new lead before ${shortDate(r.cutoff)}` : ''}.` : `, enough for the ${r.tierName} goal.`}`}</Note>
    </Panel>
  );
}

function Levers({ r }: { r: GoalsReport }) {
  const max = Math.max(1, ...r.levers.map((l) => l.worth));
  return (
    <Panel icon={SlidersHorizontal} delay={320} title="Which lever moves it most" blurb="What each change is worth a quarter, from your own numbers. Biggest first."
      foot="Each lever is worked out on its own, at the goal's pace. Marketing assumes extra leads cost what they cost today.">
      <div className="-mt-2">
        {r.levers.map((l, k) => (
          <div key={l.title} className={`hud-row-in py-3 ${k < r.levers.length - 1 ? 'border-b border-slate-100' : ''}`} style={{ animationDelay: `${340 + k * 40}ms` }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-slate-800">{l.title}</span>
              <span className={`text-sm font-black tabular-nums shrink-0 ${l.worth > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{l.worth > 0 ? `+${money(l.worth)}` : money(l.worth)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{l.line}</div>
            <Track pct={(Math.max(0, l.worth) / max) * 100} color={TONE_HEX.ok} className="mt-2" delay={380 + k * 40} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── The year ───────────────────────────────────────────────────────────── */

function Year({ r }: { r: GoalsReport }) {
  const top = Math.max(r.goal, ...r.quarters.map((x) => x.earned + x.expected)) * 1.15 || 1;
  const H = 160;
  const px = (v: number) => (v / top) * H;
  return (
    <Panel icon={CalendarDays} lift={false} delay={360} title={`${r.fy.label}, quarter by quarter`} blurb={`Margin earned and still to land against each quarter's ${r.tierName} goal, with revenue booked under each.`}
      aside={(
        <div className="flex gap-6 text-right flex-wrap justify-end">
          <div><Eyebrow>Year's goal</Eyebrow><div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{money(r.fyGoal)}</div><div className="text-[11px] text-slate-500">4 × {money(r.goal)}</div></div>
          <div><Eyebrow>Earned and signed</Eyebrow><div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{money(r.fyHave)}</div><div className="text-[11px] text-slate-500">{Math.round((r.fyHave / (r.fyGoal || 1)) * 100)}% of the year's goal</div></div>
          <div><Eyebrow>Still to win</Eyebrow><div className="mt-1.5 text-2xl font-black text-amber-700 tabular-nums">{money(r.fyLeft)}</div>
            <div className="text-[11px] text-slate-500">{r.fyLeft > 0 && r.avgMargin ? `About ${Math.ceil(r.fyLeft / r.avgMargin)} typical projects${r.lastStart > r.now ? `, signed by ${shortDate(r.lastStart)}` : ''}` : 'Covered'}</div></div>
        </div>
      )}>
      <div className="relative flex gap-4 sm:gap-7 items-end px-2 sm:px-6 border-b border-slate-100" style={{ height: H + 28 }}>
        <div className="absolute left-0 right-0 border-t-[1.5px] border-dashed pointer-events-none" style={{ bottom: px(r.goal), borderColor: BRAND }} />
        {r.qCosts < r.goal && <div className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-slate-400 pointer-events-none" style={{ bottom: px(r.qCosts) }} />}
        {r.quarters.map((x, k) => (
          <div key={x.label} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1 h-full">
            <span className={`text-xs font-bold tabular-nums ${x.now ? 'text-slate-800' : 'text-slate-500'}`}>{money(x.earned + x.expected)}</span>
            <div className="w-full max-w-[72px] flex flex-col justify-end">
              {x.expected > 0 && <div className="rp-bar rounded-t-md" style={{ height: px(x.expected), background: 'rgba(5,150,105,0.3)', animationDelay: `${400 + k * 60}ms` }} />}
              {x.earned > 0 && <div className={`rp-bar ${x.expected > 0 ? '' : 'rounded-t-md'}`} style={{ height: px(x.earned), background: TONE_HEX.ok, animationDelay: `${400 + k * 60}ms` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 sm:gap-7 px-2 sm:px-6 pt-2">
        {r.quarters.map((x) => {
          const total = x.earned + x.expected;
          const met = total >= r.goal, be = total >= r.qCosts;
          const tone = met ? 'ok' : be ? 'warn' : x.past ? 'bad' : x.now ? 'warn' : 'none';
          return (
            <div key={x.label} className="flex-1 min-w-0 text-center">
              <div className={`text-xs font-bold ${x.now ? 'text-slate-800' : 'text-slate-500'}`}>{x.label} · {x.span}</div>
              <div className="text-[11px] text-slate-500">{x.booked ? `${money(x.booked)} booked` : 'Nothing booked yet'} · {plural(x.signed, 'project')}</div>
              <div className="mt-1"><Chip tone={tone as any}>{met ? 'Goal met' : be ? 'Broke even' : x.past ? 'Short' : x.now ? `${money(r.goal - total)} to find` : `${money(r.goal - total)} to win`}</Chip></div>
            </div>
          );
        })}
      </div>
      <div className="mt-4"><Legend items={[
        { color: TONE_HEX.ok, label: 'Earned' }, { color: 'rgba(5,150,105,0.3)', label: 'Still to land from signed work' },
        { color: BRAND, label: `${r.tierName} goal ${money(r.goal)}`, dashed: true },
        ...(r.qCosts < r.goal ? [{ color: '#94a3b8', label: `Break even ${money(r.qCosts)}`, dashed: true }] : []),
      ]} /></div>
    </Panel>
  );
}

/* ── The founders' assumptions ──────────────────────────────────────────── */

const LAKH = 100000;

function BandsEditor({ r, plan, set }: { r: GoalsReport; plan: FounderPlan; set: (p: Partial<FounderPlan>) => void }) {
  const edit = (k: number, key: keyof Band, v: number | null) => {
    const next = r.bands.map((b, j) => (j === k ? { ...b, [key]: key === 'value' ? Math.round((v || 0) * LAKH) : v || 0 } : b));
    set({ bands: next });
  };
  const mixOk = Math.round(r.mixSum) === 100;
  return (
    <Panel icon={LayoutGrid} lift={false} delay={400} title="Projects by size"
      blurb={r.bandsFromApp ? `From your actual projects: ${plural(r.bandsBasedOn, 'signing')}${r.bandsBasedOn >= 3 ? ' in the last 12 months' : ', so the sheet fills the gaps'}. Change any figure to try a what-if.` : 'Your figures. Reset to go back to what your actual projects say.'}
      aside={<Chip tone={mixOk ? 'ok' : 'warn'}>{mixOk ? 'Mix adds up to 100%' : `Mix adds up to ${Math.round(r.mixSum)}%, scaled to 100`}</Chip>}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[720px]">
          <thead><tr className="text-left">
            {['Size band', 'Typical value', 'Margin', 'Runs for', 'Share of signings', 'Margin each', `Signed in ${r.quarter.label}`].map((h) => <th key={h} className="px-2 py-2 border-b border-slate-100"><Eyebrow>{h}</Eyebrow></th>)}
          </tr></thead>
          <tbody>
            {r.bands.map((b, k) => {
              const signed = r.work.filter((w) => w.band === k && w.start >= r.quarter.start && w.start < r.quarter.end).length;
              return (
                <tr key={BANDS[k].label}>
                  <td className="px-2 py-2.5 border-b border-slate-100 font-semibold text-slate-800 whitespace-nowrap">{BANDS[k].label}</td>
                  <td className="px-2 py-2.5 border-b border-slate-100"><NumInput narrow label={`${BANDS[k].label} typical value, in lakh`} pre="₹" unit="L" step={0.5} value={b.value / LAKH} onChange={(v) => edit(k, 'value', v)} /></td>
                  <td className="px-2 py-2.5 border-b border-slate-100"><NumInput narrow label={`${BANDS[k].label} margin`} unit="%" max={100} value={b.margin} onChange={(v) => edit(k, 'margin', v)} /></td>
                  <td className="px-2 py-2.5 border-b border-slate-100"><NumInput narrow label={`${BANDS[k].label} months it runs`} unit="mo" step={0.5} min={0.5} value={b.months} onChange={(v) => edit(k, 'months', v)} /></td>
                  <td className="px-2 py-2.5 border-b border-slate-100"><NumInput narrow label={`${BANDS[k].label} share of signings`} unit="%" max={100} value={b.mix} onChange={(v) => edit(k, 'mix', v)} /></td>
                  <td className="px-2 py-2.5 border-b border-slate-100 font-bold text-slate-800 tabular-nums">{money(r.marginEach(b))}</td>
                  <td className="px-2 py-2.5 border-b border-slate-100 text-slate-700">{signed ? plural(signed, 'project') : 'None yet'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {plan.bands && <div className="mt-3"><SmallButton onClick={() => set({ bands: null })}>Use what the projects say</SmallButton></div>}
    </Panel>
  );
}

function CostList({ label, color, lines, total, onChange, addLabel }: { label: string; color: string; lines: CostLine[]; total: number; onChange: (ls: CostLine[]) => void; addLabel: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5"><Swatch color={color} /><Eyebrow>{label}</Eyebrow></span>
        <span className="text-xs font-bold text-slate-800 tabular-nums">{money(total)}</span>
      </div>
      <div className="mt-2.5 flex flex-col gap-2">
        {lines.map((c, k) => (
          <div key={k} className="flex gap-2 items-center">
            <input aria-label="Cost name" value={c.name} maxLength={60}
              onChange={(e) => onChange(lines.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
            <div className="w-36 shrink-0"><NumInput label={`${c.name || 'Cost'} a month`} pre="₹" step={500} value={c.amount} onChange={(v) => onChange(lines.map((x, j) => (j === k ? { ...x, amount: Math.round(v || 0) } : x)))} /></div>
            <button type="button" aria-label={`Remove ${c.name || 'this cost'}`} onClick={() => onChange(lines.filter((_, j) => j !== k))}
              className="px-2 py-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-rose-700 text-base leading-none">×</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...lines, { name: 'New cost', amount: 0 }])}
          className="self-start px-3 py-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-[#3D52A0] text-xs font-bold hover:bg-slate-50">+ {addLabel}</button>
      </div>
    </div>
  );
}

function CostsEditor({ r, plan, set }: { r: GoalsReport; plan: FounderPlan; set: (p: Partial<FounderPlan>) => void }) {
  const homeShare = r.monthly ? Math.round((r.homeTotal / r.monthly) * 100) : 0;
  const aside = (
    <div className="text-right"><Eyebrow>A month</Eyebrow><div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{money(r.monthly)}</div><div className="text-[11px] text-slate-500">{money(r.qCosts)} a quarter</div></div>
  );
  return (
    <Panel icon={Wallet} lift={false} delay={440} title="What a month costs" aside={aside}
      blurb={r.monthly ? `Household is ${homeShare}% of what the business must earn. Every ₹10,000 a month of cost needs ₹30,000 more margin a quarter, or ${r.avgMargin ? one(120000 / r.avgMargin) : '—'} more projects a year.` : 'List what the studio and the two homes cost a month. The goal starts from these.'}
      foot={`${r.studioFromTargets ? "Studio costs start from Set targets' overheads. " : 'Saving studio costs also updates the overheads in Set targets, where your role allows. '}Household costs live only here: only formfactors.operations@gmail.com and formfactorsdesignstudio@gmail.com can read or change them.`}>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
        <div className="rp-hbar h-full" style={{ width: pct(r.studioTotal, r.monthly), background: BRAND }} />
        <div className="rp-hbar h-full" style={{ width: pct(r.homeTotal, r.monthly), background: HOME, animationDelay: '110ms' }} />
      </div>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-7">
        <CostList label="Studio" color={BRAND} lines={r.studio} total={r.studioTotal} addLabel="Add a studio cost" onChange={(ls) => set({ studio: ls })} />
        <CostList label="Household" color={HOME} lines={plan.home} total={r.homeTotal} addLabel="Add a household cost" onChange={(ls) => set({ home: ls })} />
      </div>
    </Panel>
  );
}

const Field: React.FC<{ label: string; src: React.ReactNode; children: React.ReactNode }> = ({ label, src, children }) => (
  <label className="flex flex-col gap-1.5 min-w-0"><Eyebrow>{label}</Eyebrow>{children}<span className="text-[11px] text-slate-500">{src}</span></label>
);

function CashEditor({ r, plan, set }: { r: GoalsReport; plan: FounderPlan; set: (p: Partial<FounderPlan>) => void }) {
  return (
    <Panel icon={ShieldCheck} lift={false} delay={480} title="Cash and safety" blurb="The app does not see the bank, so cash is yours to enter. Update it once a month.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Cash the studio can spend" src={plan.cashAt ? `After vendor dues. Entered ${shortDate(plan.cashAt)}.` : 'After vendor dues.'}>
          <NumInput label="Cash the studio can spend, in lakh" pre="₹" unit="L" step={0.5} min={-1000} value={plan.cash == null ? null : plan.cash / LAKH}
            onChange={(v) => set({ cash: v == null ? null : Math.round(v * LAKH), cashAt: Date.now() })} />
        </Field>
        <Field label="Safety buffer" src={`${money(r.bufferTarget)} at today's costs`}>
          <NumInput label="Safety buffer, in months of costs" unit="months of costs" step={1} value={plan.buffer} onChange={(v) => set({ buffer: v || 0 })} />
        </Field>
        <Field label="Rebuild the buffer over" src={`${money(r.rebuildQ)} a quarter`}>
          <NumInput label="Quarters to rebuild the buffer over" unit="quarters" step={1} min={1} value={plan.rebuild} onChange={(v) => set({ rebuild: Math.max(1, v || 1) })} />
        </Field>
        <Field label="Profit on top, for Grow" src={`${money(r.growthQ)} a quarter`}>
          <NumInput label="Profit on top of costs, for Grow" unit="% of costs" step={1} value={plan.growth} onChange={(v) => set({ growth: v || 0 })} />
        </Field>
      </div>
    </Panel>
  );
}

function FunnelEditor({ r, plan, set }: { r: GoalsReport; plan: FounderPlan; set: (p: Partial<FounderPlan>) => void }) {
  const field = (key: keyof Funnel, label: string, unit: string, fmt: (v: number) => string) => (
    <Field label={label} src={`From the app: ${fmt(r.appFunnel[key])}${plan.funnel?.[key] != null ? ' (yours differs)' : ''}`}>
      <NumInput label={label} unit={unit} max={key === 'cycle' || key === 'leads' ? undefined : 100} step={key === 'leads' ? 0.5 : 1}
        value={r.funnel[key]} onChange={(v) => set({ funnel: { ...(plan.funnel || {}), [key]: v || 0 } })} />
    </Field>
  );
  return (
    <Panel icon={Filter} lift={false} delay={520} title="How leads turn into projects" blurb="From the app: actual leads in the last 12 months. Change one to see what a better rate is worth.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {field('leads', 'Leads a month', '', (v) => one(v))}
        {field('meet', 'Reach a meeting', '%', (v) => `${v}%`)}
        {field('prop', 'Get a proposal', '%', (v) => `${v}%`)}
        {field('win', 'Proposals won', '%', (v) => `${v}%`)}
        {field('cycle', 'Lead to signing', 'days', (v) => `${v} days`)}
        {field('referral', 'From referrals', '%', (v) => `${v}%`)}
      </div>
    </Panel>
  );
}

/* ── The tab ────────────────────────────────────────────────────────────── */

export default function FoundersGoals({ r, plan, set, onOpenProject, leadsRead }: {
  r: GoalsReport;
  plan: FounderPlan;
  set: (p: Partial<FounderPlan>) => void;
  onOpenProject: (id: string) => void;
  leadsRead: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Hero r={r} />
      <Moves r={r} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GoalLevel r={r} onTier={(t) => set({ tier: t })} />
        <Runway r={r} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Projects r={r} />
        <Team r={r} />
      </div>
      <Leads r={r} leadsRead={leadsRead} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Pipeline r={r} onOpenProject={onOpenProject} />
        <Levers r={r} />
      </div>
      <Year r={r} />

      <div className="mt-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Your assumptions</h3>
          <p className="text-xs text-slate-500 mt-0.5">Everything above is worked out from these, and saved as you type. Figures marked "from the app" come from actual projects and leads; change one to try a what-if.</p>
        </div>
        {(plan.bands || plan.funnel) && <SmallButton onClick={() => set({ bands: null, funnel: null })}>Reset to the app's figures</SmallButton>}
      </div>
      <BandsEditor r={r} plan={plan} set={set} />
      <CostsEditor r={r} plan={plan} set={set} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CashEditor r={r} plan={plan} set={set} />
        <FunnelEditor r={r} plan={plan} set={set} />
      </div>
    </div>
  );
}
