/**
 * Insights — one card, one chart at a time.
 *
 * Drawings, Payments, Programme, Cost & margin (owner) and Activity. The card
 * opens on what matters at the project's stage and remembers the last tab the
 * user chose. Each panel animates in when it is shown.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, Donut, useArmed, useUi, tipProps, Glyph, GlyphName } from './bits';
import {
  DrawingModel, DrawingCell, PaymentModel, PaymentRung, GanttRow, GatePin, CostModel, ActivityItem,
  inr, inrShort, shortDate, dayNum, isoOf, DAY, anyMs, timelineModel,
} from '../../lib/projectHome';

export type InsightTab = 'draw' | 'money' | 'prog' | 'cost' | 'act';
const TAB_KEY = 'ffds-home-tab';

interface Props {
  stage: number;
  canSeeMoney: boolean;
  drawings: DrawingModel | null;
  sharedDocs: { name: string; ms: number }[];
  payments: PaymentModel;
  programme: { rows: GanttRow[]; pins: GatePin[]; finishISO: string | null; stale: boolean };
  cost: CostModel;
  marginLine: React.ReactNode;
  pnlCard: React.ReactNode;
  activity: ActivityItem[];
  activitySummary: string;
  activityStats: { meetings: number; sites: number; hours: number; decisions: number; received: number };
  jump: { tab: InsightTab; n: number } | null;
  go: (route: string) => void;
  openHistory: () => void;
  /** Opens the meeting form, from the "days without a visit" marker. */
  onPlanCheckIn: () => void;
}

export default function InsightsCard(p: Props) {
  const tabs = useMemo(() => {
    const t: { id: InsightTab; label: string; icon: React.ReactNode; owner?: boolean }[] = [
      { id: 'draw', label: 'Drawings', icon: Icon.grid() },
      { id: 'money', label: 'Payments', icon: Icon.money() },
      { id: 'prog', label: 'Programme', icon: Icon.bars() },
    ];
    if (p.canSeeMoney) t.push({ id: 'cost', label: 'Cost & margin', icon: Icon.pie(), owner: true });
    t.push({ id: 'act', label: 'Activity', icon: Icon.pulse() });
    return t;
  }, [p.canSeeMoney]);

  // Opens on what the stage calls for, unless the user has chosen before. The
  // default is live, not frozen at mount: the drawings arrive a moment after
  // the page does, and a project with none should open on Payments instead.
  const stageDefault: InsightTab = p.stage >= 5 ? 'prog' : (!p.drawings || p.drawings.total > 0 ? 'draw' : 'money');
  const [chosen, setTab] = useState<InsightTab | null>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as InsightTab | null;
      if (saved) return saved;
    } catch { /* storage unavailable — fall back to the stage default */ }
    return null;
  });
  const tab = chosen || stageDefault;
  const valid = tabs.some(t => t.id === tab) ? tab : (tabs.some(t => t.id === stageDefault) ? stageDefault : 'money');

  const choose = (t: InsightTab) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* not persisted; still switches */ }
  };

  // A button elsewhere on the page can open a tab ("See drawings").
  useEffect(() => { if (p.jump) setTab(p.jump.tab); }, [p.jump]);

  // Sliding underline under the active tab.
  const bar = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number }>({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = bar.current?.querySelector(`[data-tab="${valid}"]`) as HTMLElement | null;
      if (el && bar.current) setInk({ x: el.offsetLeft + 8, w: Math.max(0, el.offsetWidth - 16) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [valid, tabs]);

  return (
    <section className="ph-card ph-rise" style={{ animationDelay: '.16s' }} id="ph-insights">
      <div className="ph-tabs" role="tablist" ref={bar}>
        {tabs.map(t => (
          <button key={t.id} className="ph-tab" role="tab" data-tab={t.id} aria-selected={valid === t.id} onClick={() => choose(t.id)}>
            {t.icon}{t.label}{t.owner && <span className="lock">OWNER</span>}
          </button>
        ))}
        <span className="ph-tab-ink" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} />
      </div>
      {valid === 'draw' && <DrawingsPanel {...p} />}
      {valid === 'money' && <PaymentsPanel {...p} />}
      {valid === 'prog' && <ProgrammePanel {...p} />}
      {valid === 'cost' && p.canSeeMoney && <CostPanel {...p} />}
      {valid === 'act' && <ActivityPanel {...p} />}
    </section>
  );
}

/* ───────────────────────────── Drawings ───────────────────────────── */

const STATE_LABEL: Record<DrawingCell['state'], string> = {
  approved: 'Approved', client: 'With client', revise: 'In revision', none: 'Not issued',
};

function cellTip(c: DrawingCell) {
  const where = c.state === 'client' && c.daysWithClient != null ? ` · ${c.daysWithClient} days with the client` : '';
  // A round only exists once a drawing has gone out; the tracker keeps a stored count even before that.
  const round = c.state !== 'none' && c.round ? ` · round ${c.round}` : '';
  return <><b>{c.name}</b>{STATE_LABEL[c.state]}{round}{where}</>;
}

function DrawingsPanel({ drawings, sharedDocs, go }: Props) {
  const armed = useArmed();
  const ui = useUi();
  // A stage the user is looking at: hovering previews it, clicking pins it.
  const [hover, setHover] = useState<DrawingCell['state'] | null>(null);
  const [pinned, setPinned] = useState<DrawingCell['state'] | null>(null);
  if (!drawings) return <div className="ph-panel"><div className="ph-empty"><b>Loading drawings…</b></div></div>;
  if (drawings.total === 0) {
    return (
      <div className="ph-panel">
        <div className="ph-empty">
          <b>No drawings in the tracker yet</b>
          The Drawing Tracker fills in from the BOQ once scope is set.
          <div style={{ marginTop: 12 }}><button className="ph-btn sm" onClick={() => go('drawing-tracker')}>Open Drawing Tracker</button></div>
        </div>
      </div>
    );
  }
  const d = drawings;
  const focus = hover || pinned;
  const all = [...d.rooms.flatMap(r => Object.values(r.cells).filter(Boolean) as DrawingCell[]), ...d.wide];
  const waiting = all.filter(c => c.state === 'client' && c.daysWithClient != null).sort((a, b) => (b.daysWithClient || 0) - (a.daysWithClient || 0))[0];

  // One sentence on where the set stands.
  const lede = d.issued === 0
    ? <>None of the <b>{d.total} working drawings</b> has gone to the client yet.</>
    : <><b>{d.issued} of {d.total}</b> issued{d.approved ? <>, <b>{d.approved} approved</b></> : ''}.
        {waiting ? <> The longest with the client is <b>{waiting.name}</b> — {waiting.daysWithClient} day{waiting.daysWithClient === 1 ? '' : 's'}.</> : ''}</>;

  const STAGES: { s: DrawingCell['state']; label: string; n: number; glyph: GlyphName }[] = [
    { s: 'none', label: 'Not issued', n: d.notIssued, glyph: 'sheet' },
    { s: 'client', label: 'With client', n: d.withClient, glyph: 'hourglass' },
    { s: 'revise', label: 'In revision', n: d.inRevision, glyph: 'pencil' },
    { s: 'approved', label: 'Approved', n: d.approved, glyph: 'decision' },
  ];
  const typeGlyph = (t: string): GlyphName => /elevation/i.test(t) ? 'elevation' : /detail|carpentry|joinery/i.test(t) ? 'detail' : 'sheet';

  const sheet = (c: DrawingCell | undefined, i: number, withName = false) => {
    if (!c) return <span key={`x${i}`} className="ph-sheet-empty" />;
    const meta = c.state === 'client' && c.daysWithClient != null ? `${c.daysWithClient} d`
      : c.state === 'revise' && c.round ? `R${c.round}` : '';
    return (
      <button key={c.id} className={`ph-sheet ${c.state}${focus && focus !== c.state ? ' dim' : ''}`} style={{ ['--d' as any]: `${i * 0.025}s` }}
        onClick={() => go('drawing-tracker')} aria-label={`${c.name}: ${STATE_LABEL[c.state]}`} {...tipProps(ui, cellTip(c))}>
        <Glyph name={c.state === 'approved' ? 'decision' : typeGlyph(c.type || c.name)} />
        <span className="t">{withName ? <b>{c.name.length > 30 ? c.name.slice(0, 28) + '…' : c.name}</b> : null}{STATE_LABEL[c.state]}</span>
        {meta && <span className="m">{meta}</span>}
      </button>
    );
  };

  let k = 0;
  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <p className="ph-lede">{lede}</p>
      <div className="ph-flow-row">
        <div className="ph-flow" role="group" aria-label="Drawings by stage">
          {STAGES.map((st, i) => (
            <React.Fragment key={st.s}>
              {i > 0 && <span className="ph-flow-sep" aria-hidden="true">{Icon.right(12)}</span>}
              <button className={`ph-stage ${st.s}${st.n ? '' : ' zero'}${focus === st.s ? ' on' : ''}`} aria-pressed={pinned === st.s}
                onMouseEnter={() => setHover(st.s)} onMouseLeave={() => setHover(null)}
                onClick={() => setPinned(p => p === st.s ? null : st.s)}>
                <span className="gi"><Glyph name={st.glyph} /></span>
                <span className="tx"><b className="ph-num">{st.n}</b><small>{st.label}</small></span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <button className="ph-btn sm" onClick={() => go('drawing-tracker')}>Open Drawing Tracker</button>
      </div>

      {d.rooms.length > 0 && (
        <div className="ph-sheets" style={{ gridTemplateColumns: `minmax(130px,.75fr) ${d.types.map(() => 'minmax(0,1fr)').join(' ')}` }}>
          <span className="h">Room</span>
          {d.types.map(t => <span key={t} className="h"><Glyph name={typeGlyph(t)} />{t}</span>)}
          {d.rooms.map(r => {
            const cells = d.types.map(t => r.cells[t]).filter(Boolean) as DrawingCell[];
            return (
              <React.Fragment key={r.room}>
                <span className="rm">
                  <span className="nm" title={r.room}>{r.room}</span>
                  <span className="ph-dots" aria-hidden="true">{cells.map(c => <i key={c.id} className={c.state} />)}</span>
                </span>
                {d.types.map(t => sheet(r.cells[t], k++))}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {d.wide.length > 0 && (
        <div style={{ marginTop: d.rooms.length ? 14 : 0 }}>
          {d.rooms.length > 0 && <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Project-wide</div>}
          <div className="ph-sheets-wide">{d.wide.map(c => sheet(c, k++, true))}</div>
        </div>
      )}
      {sharedDocs.length > 0 && (
        <div className="ph-dr-shared">
          <span style={{ fontWeight: 700, color: 'var(--ph-ink-2)' }}>On the client&rsquo;s portal:</span>
          {sharedDocs.map(s => (
            <span key={s.name} className="th" {...tipProps(ui, <><b>{s.name}</b>{s.ms ? `Published ${shortDate(s.ms)}` : 'Published'}</>)}>
              <Glyph name="portal" />{s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Payments ───────────────────────────── */

function PaymentsPanel({ payments, go }: Props) {
  const armed = useArmed(120);
  const ui = useUi();
  // A state the user is looking at: hovering previews it, clicking pins it.
  const [hover, setHover] = useState<PaymentRung['state'] | null>(null);
  const [pinned, setPinned] = useState<PaymentRung['state'] | null>(null);
  const pm = payments;
  if (!pm.rungs.length) {
    return (
      <div className="ph-panel">
        <div className="ph-empty"><b>No payment schedule yet</b>Set one up in Money to see what is collected, due and later.
          <div style={{ marginTop: 12 }}><button className="ph-btn sm" onClick={() => go('payment-calc')}>Open Money</button></div></div>
      </div>
    );
  }
  const focus = hover || pinned;
  const rungs = pm.rungs;
  const pct = pm.gross ? Math.round((pm.collected / pm.gross) * 100) : 0;
  const invoicedDue = pm.due.filter(r => r.invoiced).length;
  const next = rungs.find(r => r.state === 'up');

  // One sentence on where the money stands.
  const lede = <>
    <b>{inr(pm.collected)}</b> of {inr(pm.gross)} collected ({pct}%).{' '}
    {pm.due.length
      ? <><b>{inr(pm.dueNow)}</b> is due now across {pm.due.length} payment{pm.due.length === 1 ? '' : 's'}
          {invoicedDue === 0 ? ' — none invoiced yet.' : invoicedDue === pm.due.length ? ' — all invoiced, awaiting payment.' : ` — ${invoicedDue} invoiced, ${pm.due.length - invoicedDue} still to raise.`}</>
      : next ? <>Nothing is due right now. Next is <b>{next.name}</b>{next.trigger ? <> — {next.trigger.replace(/\.$/, '').replace(/^./, c => c.toLowerCase())}</> : ''}.</> : <>Every payment is collected.</>}
  </>;

  const STAGES: { s: PaymentRung['state']; label: string; amount: number; n: number; glyph: GlyphName }[] = [
    { s: 'paid', label: 'Collected', amount: pm.collected, n: rungs.filter(r => r.state === 'paid').length, glyph: 'decision' },
    { s: 'due', label: 'Due now', amount: pm.dueNow, n: pm.due.length, glyph: 'invoice' },
    { s: 'up', label: 'Later', amount: pm.later, n: pm.laterCount, glyph: 'calnext' },
  ];

  // Design and Execution labels over their runs of stations.
  const runs: { type: string; from: number; to: number; total: number }[] = [];
  rungs.forEach((r, i) => {
    const last = runs[runs.length - 1];
    if (last && last.type === r.type) { last.to = i; last.total += r.amount; }
    else runs.push({ type: r.type, from: i, to: i, total: r.amount });
  });
  // The line between two stations: green once both are collected, gold into what is due now.
  const link = (a?: PaymentRung, b?: PaymentRung) => !a || !b ? 'none' : a.state === 'paid' && b.state === 'paid' ? 'paid' : b.state === 'due' || a.state === 'due' ? 'due' : 'up';
  const current = rungs.findIndex(r => r.state === 'due');
  const maxAmt = Math.max(1, ...rungs.map(r => r.amount));
  const status = (r: PaymentRung) => r.state === 'paid' ? 'Collected' : r.state === 'due' ? (r.invoiced ? 'Invoiced' : 'Not invoiced') : 'Later';

  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <p className="ph-lede">{lede}</p>
      <div className="ph-flow-row">
        <div className="ph-flow" role="group" aria-label="Payments by state">
          {STAGES.map((st, i) => (
            <React.Fragment key={st.s}>
              {i > 0 && <span className="ph-flow-sep" aria-hidden="true">{Icon.right(12)}</span>}
              <button className={`ph-stage pay-${st.s}${st.n ? '' : ' zero'}${focus === st.s ? ' on' : ''}`} aria-pressed={pinned === st.s}
                onMouseEnter={() => setHover(st.s)} onMouseLeave={() => setHover(null)} onClick={() => setPinned(p => p === st.s ? null : st.s)}>
                <span className="gi"><Glyph name={st.glyph} /></span>
                <span className="tx"><b className="ph-num">{inr(st.amount)}</b><small>{st.label} · {st.n}</small></span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <button className="ph-btn sm" onClick={() => go('payment-calc')}>Open Money</button>
      </div>

      <div className="ph-stations-scroll">
        <div className="ph-stations" style={{ gridTemplateColumns: `repeat(${rungs.length}, minmax(86px, 1fr))` }}>
          {runs.map(r => (
            <div key={`${r.type}-${r.from}`} className="ph-st-group" style={{ gridColumn: `${r.from + 1} / ${r.to + 2}` }}>
              <span>{r.type === 'design' ? 'Design fee' : 'Execution'} · {inrShort(r.total)}</span>
            </div>
          ))}
          {rungs.map((r, i) => (
            <button key={r.id} className={`ph-st ${r.state}${i === current ? ' current' : ''}${focus && focus !== r.state ? ' dim' : ''}`}
              style={{ gridRow: 2, gridColumn: i + 1, ['--d' as any]: `${0.1 + i * 0.07}s` }} onClick={() => go('payment-calc')}
              aria-label={`${r.name}, ${inr(r.amount)}, ${status(r)}`}
              {...tipProps(ui, <><b>{r.name} · {inr(r.amount)}</b>{status(r)}{r.state === 'due' && !r.invoiced ? ' — raise it in Money' : ''} · {((r.amount / (pm.gross || 1)) * 100).toFixed(1)}% of the total{r.trigger && <small>{r.trigger}</small>}</>)}>
              <span className="rail">
                <i className={`l ${link(rungs[i - 1], r)}`} />
                <span className="node">{r.state === 'paid' ? Icon.check(13) : <Glyph name={r.state === 'due' ? 'rupee' : 'lock'} />}</span>
                <i className={`r ${link(r, rungs[i + 1])}`} />
              </span>
              <b className="amt ph-num">{inrShort(r.amount)}</b>
              <span className="nm">{r.name}</span>
              <span className="sub">{status(r)}</span>
              <span className="share"><i style={{ width: armed ? `${(r.amount / maxAmt) * 100}%` : 0 }} /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Programme ──────────────────────────── */

const monthStart = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

function ProgrammePanel({ programme, go }: Props) {
  const armed = useArmed(120);
  const ui = useUi();
  // The task a hovered payment tag releases, lit up in the chart.
  const [lit, setLit] = useState<string | null>(null);
  const { rows, pins, finishISO, stale } = programme;
  if (!rows.length) {
    return (
      <div className="ph-panel">
        <div className="ph-empty"><b>No programme yet</b>Build one in the Timeline to see stages, dates and payments together.
          <div style={{ marginTop: 12 }}><button className="ph-btn sm" onClick={() => go('timeline')}>Open Timeline</button></div></div>
      </div>
    );
  }
  const starts = rows.map(r => dayNum(r.start));
  const ends = rows.map(r => dayNum(r.end));
  const from = monthStart(Math.min(...starts) * DAY) / DAY;
  const lastEnd = Math.max(...ends);
  const endD = new Date(lastEnd * DAY);
  const to = Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() + 1, 1) / DAY;
  const span = Math.max(1, to - from);
  const pc = (iso: string) => ((dayNum(iso) - from) / span) * 100;
  const today = dayNum(isoOf(Date.now()));
  const months: number[] = [];
  for (let m = from * DAY; m < to * DAY;) { months.push(m); const d = new Date(m); m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  const fmt = (iso: string) => shortDate(dayNum(iso) * DAY);

  const lastDesignEnd = Math.max(0, ...rows.filter(r => r.kind === 'design').map(r => dayNum(r.end)));
  const inDesign = (r: GanttRow) => r.kind === 'design' || (r.kind === 'milestone' && dayNum(r.start) <= lastDesignEnd);
  const groups = [
    { name: 'Design', glyph: 'plan' as GlyphName, rows: rows.filter(inDesign) },
    { name: 'Site', glyph: 'hardhat' as GlyphName, rows: rows.filter(r => !inDesign(r)) },
  ].filter(g => g.rows.length);
  // A payment tag belongs to the task it releases: the one that starts (or, for GFC, ends) on its date.
  const pinTask = (at: string) => rows.find(r => r.kind !== 'milestone' && (r.start === at || r.end === at));
  // Tags a few days apart would overlap; the second drops to a lower line.
  const pinRows: number[] = [];
  pins.forEach((g, i) => { pinRows[i] = i > 0 && Math.abs(pc(g.at) - pc(pins[i - 1].at)) < 6 && pinRows[i - 1] === 0 ? 1 : 0; });
  const twoPinLines = pinRows.includes(1);
  let i = 0;

  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <p className="ph-lede">
        {rows.length} tasks from {fmt(rows.map(r => r.start).sort()[0])} to a forecast handover on <b>{finishISO ? new Date(finishISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</b>.
        {pins.length > 0 && ' Gold tags are payments due before the work they release — hover one to see which.'}
      </p>
      <div className="ph-gt-scroll">
        <div className="ph-gt">
          {/* month bands and the today line, behind every row */}
          <div className="ph-gt-grid" aria-hidden="true">
            {months.map((m, k) => {
              const l = ((m / DAY - from) / span) * 100;
              const next = k + 1 < months.length ? ((months[k + 1] / DAY - from) / span) * 100 : 100;
              return <div key={m} className={`ph-gt-month${k % 2 ? ' alt' : ''}`} style={{ left: `${l}%`, width: `${next - l}%` }} />;
            })}
            {today >= from && today <= to && (
              <div className="ph-gt-today" style={{ left: `${((today - from + 0.5) / span) * 100}%` }}><b>Today</b></div>
            )}
          </div>

          <div className="ph-gt-row axis">
            <div className="nm" />
            <div className="tr">
              {months.map(m => {
                const d = new Date(m);
                return (
                  <span key={m} style={{ left: `${((m / DAY - from) / span) * 100}%` }}>
                    {d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}{d.getUTCMonth() === 0 ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ''}
                  </span>
                );
              })}
            </div>
          </div>

          {pins.length > 0 && (
            <div className={`ph-gt-row pay${twoPinLines ? ' two' : ''}`}>
              <div className="nm"><i className="dot gold" />Payments due</div>
              <div className="tr">
                {pins.map((g, k) => {
                  const task = pinTask(g.at);
                  // One set of handlers: the tooltip's own and lighting the task it releases.
                  const tip = tipProps(ui, <><b>{g.name} · {g.label}</b>Due before {task ? task.title : 'the work it releases'}{g.trigger && <small>{g.trigger}</small>}</>);
                  return (
                    <span key={g.name} className="ph-gt-tag" style={{ left: `${pc(g.at)}%`, top: pinRows[k] ? 26 : 5, ['--d' as any]: `${0.7 + k * 0.1}s` }}
                      onMouseMove={tip.onMouseMove}
                      onMouseEnter={e => { tip.onMouseEnter(e); setLit(task?.id || null); }}
                      onMouseLeave={() => { tip.onMouseLeave(); setLit(null); }}>
                      {g.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {groups.map(g => (
            <React.Fragment key={g.name}>
              <div className="ph-gt-row group">
                <div className="nm"><Glyph name={g.glyph} />{g.name}<small>{g.rows.filter(r => r.kind !== 'milestone').length} tasks</small></div>
                <div className="tr" />
              </div>
              {g.rows.map(r => {
                const n = i++;
                const s = pc(r.start), e = Math.min(100, pc(r.end) + 100 / span);
                const tip = tipProps(ui, <><b>{r.title}</b>{fmt(r.start)}{r.end !== r.start ? ` – ${fmt(r.end)}` : ''}<small>{r.status.replace('_', ' ')}</small></>);
                return (
                  <div key={r.id} className={`ph-gt-row task${lit === r.id ? ' lit' : ''}`}>
                    <div className="nm"><i className={`dot ${r.status}`} />{r.title}</div>
                    <div className="tr">
                      {r.kind === 'milestone'
                        ? <button className={`ph-gt-ms ${r.status}`} style={{ left: `${s}%`, ['--d' as any]: `${0.15 + n * 0.04}s` }}
                            onClick={() => go('timeline')} aria-label={`${r.title}, ${fmt(r.start)}`} {...tip} />
                        : <button className={`ph-gt-bar ${r.status}${r.kind === 'execution' ? ' exec' : ''}`}
                            style={{ left: `${s}%`, width: `${Math.max(0.8, e - s)}%`, ['--d' as any]: `${0.15 + n * 0.04}s` }}
                            onClick={() => go('timeline')} aria-label={`${r.title}, ${fmt(r.start)} to ${fmt(r.end)}`} {...tip} />}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {stale && (
        <div className="ph-note">{Icon.info()}<span>Design tasks are still open in the programme, while the Ops Matrix has Design complete. <button className="ph-link" onClick={() => go('timeline')}>Update the programme</button></span></div>
      )}
      <div style={{ marginTop: 12 }}><button className="ph-link" onClick={() => go('timeline')}>Open Timeline {Icon.right(13)}</button></div>
    </div>
  );
}

/* ─────────────────────────── Cost & margin ────────────────────────── */

function CostPanel({ cost, marginLine, pnlCard }: Props) {
  const armed = useArmed(120);
  const ui = useUi();
  const [hl, setHl] = useState(-1);
  const [full, setFull] = useState(false);
  if (!cost.total) {
    return <div className="ph-panel"><p className="ph-lede">{marginLine}</p><div className="ph-empty"><b>No costed BOQ yet</b>Cost by category and room appears once BOQ lines carry materials and labour.</div>{pnlCard}</div>;
  }
  // Twelve bars at most; anything past that folds into one, so the bars still add up to the total.
  const shownRooms = cost.rooms.length > 12
    ? [...cost.rooms.slice(0, 11), { name: `${cost.rooms.length - 11} more rooms`, amount: cost.rooms.slice(11).reduce((s, r) => s + r.amount, 0) }]
    : cost.rooms;
  const maxRoom = Math.max(1, ...shownRooms.map(r => r.amount));
  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <p className="ph-lede">{marginLine}</p>
      <div className="ph-cost-top">
        <Donut parts={cost.cats.map(c => ({ value: c.amount, colour: c.colour, label: c.name }))} size={140} radius={54} width={16} play={armed} onHover={setHl} className="sm">
          {hl < 0
            ? <><b className="ph-num">{cost.lines}</b><span>BOQ lines</span></>
            : <><b className="ph-num">{((cost.cats[hl].amount / cost.total) * 100).toFixed(0)}%</b><span>{cost.cats[hl].name}</span></>}
        </Donut>
        <div className="ph-clist">
          {cost.cats.map((c, i) => (
            <div key={c.name} className={`ph-cli${hl === i ? ' hl' : ''}`} onMouseEnter={() => setHl(i)} onMouseLeave={() => setHl(-1)}>
              <i style={{ background: c.colour }} /><span className="n">{c.name}</span>
              <span className="p ph-num">{((c.amount / cost.total) * 100).toFixed(1)}%</span><span className="a ph-num">{inr(c.amount)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ph-eyebrow" style={{ marginTop: 18 }}>By room</div>
      <div className="ph-bars">
        {shownRooms.map((r, i) => (
          <div key={r.name} className="ph-br" {...tipProps(ui, <><b>{r.name}</b>{inr(r.amount)} · {((r.amount / cost.total) * 100).toFixed(1)}% of planned cost</>)}>
            <span className="n">{r.name}</span>
            <span className="t"><i style={{ width: armed ? `${(r.amount / maxRoom) * 100}%` : 0, transitionDelay: `${i * 0.05}s` }} /></span>
            <span className="a ph-num">{inr(r.amount)}</span>
          </div>
        ))}
      </div>
      <div className="ph-pnl-wrap">
        <button className="ph-link" aria-expanded={full} onClick={() => setFull(f => !f)}>
          {full ? 'Hide the full P&L' : 'Show the full P&L'} <span className="ph-chev" style={{ display: 'inline-flex' }}>{Icon.chev(13)}</span>
        </button>
        {full && <div style={{ marginTop: 12 }}>{pnlCard}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────────── Activity ───────────────────────────── */

const kindGlyph = (kind: ActivityItem['kind'], online = false): GlyphName =>
  kind === 'site' ? 'hardhat' : kind === 'pay' ? 'rupee' : kind === 'dec' ? 'decision' : kind === 'step' ? 'flag' : online ? 'video' : 'people';

// Stem length for each lane above the line; payments hang below it.
const LANE_STEM = [40, 82, 124];

function ActivityPanel({ activity, activitySummary, activityStats: st, openHistory, onPlanCheckIn }: Props) {
  const ui = useUi();
  const [hl, setHl] = useState<string | null>(null);
  const tl = useMemo(() => timelineModel(activity), [activity]);
  const feed = activity.filter(a => a.kind === 'meet' || a.kind === 'site' || a.kind === 'pay').slice(0, 5);
  // With a quiet-gap label on show, keep a strip clear above the highest lane so no token covers it.
  const axis = LANE_STEM[tl.lanes - 1] + 56 + (tl.quiet ? 34 : 0);
  const height = axis + 62;
  const keyOf = (iso: string, kind: string) => `${iso}|${kind}`;

  return (
    <div className="ph-panel">
      <p className="ph-lede">{activitySummary}</p>
      <div className="ph-act-wrap">
        <div className="ph-rib">
          <div className="ph-rib-stage" style={{ height }}>
            {tl.quiet && (
              <div className="ph-rib-gap" style={{ left: `${tl.quiet.fromX}%`, width: `${Math.max(0, tl.todayX - tl.quiet.fromX)}%`, height: axis }}>
                <span className="ph-gl">
                  <span className="hg"><Glyph name="hourglass" /></span>
                  {tl.quiet.days} days without a visit or meeting
                  <button className="ph-link" onClick={onPlanCheckIn}>Plan a check-in</button>
                </span>
              </div>
            )}
            <div className="ph-rib-axis" style={{ top: axis }} />
            {tl.tokens.length === 0 && (
              <div className="ph-empty" style={{ position: 'absolute', left: 0, right: 0, top: axis - 56, padding: 0 }}>Nothing logged in the last eight weeks.</div>
            )}
            {tl.tokens.map((t, i) => {
              const stem = t.below ? 22 : LANE_STEM[t.lane];
              const size = t.minutes >= 120 ? 36 : 32;
              const cy = t.below ? axis + stem + size / 2 : axis - stem - size / 2;
              const k = keyOf(t.iso, t.kind);
              const hours = t.minutes ? `${+(t.minutes / 60).toFixed(1)} h` : '';
              return (
                <React.Fragment key={t.key}>
                  <span className={`ph-stem ${t.below ? 'dn' : 'up'} k-${t.kind}`}
                    style={{ left: `${t.x}%`, top: t.below ? axis : axis - stem, height: stem, ['--i' as any]: i }} />
                  <span className={`ph-pin k-${t.kind}`} style={{ left: `${t.x}%`, top: axis }} />
                  <span className={`ph-tok k-${t.kind}${hl === k ? ' hl' : ''}`} style={{ left: `${t.x}%`, top: cy, ['--i' as any]: i }}
                    onMouseEnter={() => setHl(k)} onMouseLeave={() => setHl(null)}>
                    {hours && <span className="dur">{hours}</span>}
                    <button className="ph-tk" style={{ ['--s' as any]: `${size}px` }} aria-label={`${t.title}, ${shortDate(dayNum(t.iso) * DAY)}`}
                      onClick={openHistory} {...tipProps(ui, <><b>{t.title}</b>{shortDate(dayNum(t.iso) * DAY)}{t.detail ? ` · ${t.detail}` : ''}</>)}>
                      <Glyph name={kindGlyph(t.kind, t.online)} />
                    </button>
                  </span>
                </React.Fragment>
              );
            })}
            <div className="ph-rib-today" style={{ left: `${tl.todayX}%`, height: axis + 24 }}>
              <i style={{ top: axis }} /><span style={{ top: axis + 12 }}>Today</span>
            </div>
          </div>
          <div className="ph-rib-wks">{tl.weeks.map(w => <span key={w.label} style={{ left: `${w.x}%` }}>{w.label}</span>)}</div>
          <div className="ph-rib-sum">
            <span><span className="ph-tk k-meet"><Glyph name="people" /></span>{st.meetings} meeting{st.meetings === 1 ? '' : 's'}{st.hours ? ` · ${st.hours} h` : ''}</span>
            {st.sites > 0 && <span><span className="ph-tk k-site"><Glyph name="hardhat" /></span>{st.sites} site visit{st.sites === 1 ? '' : 's'}</span>}
            {st.decisions > 0 && <span><span className="ph-tk k-dec"><Glyph name="decision" /></span>{st.decisions} decision{st.decisions === 1 ? '' : 's'}</span>}
            {st.received > 0 && <span><span className="ph-tk k-pay"><Glyph name="rupee" /></span>{inr(st.received)} received</span>}
          </div>
        </div>
        <div>
          {feed.length === 0 && <div className="ph-empty" style={{ padding: '6px 0', textAlign: 'left' }}><b>Nothing logged yet</b>Site visits, meetings and payments will appear here.</div>}
          {feed.map((a, i) => {
            const k = keyOf(isoOf(a.ms), a.kind);
            return (
              <div key={i} className={`ph-ev ${a.kind}${hl === k ? ' hl' : ''}`} onMouseEnter={() => setHl(k)} onMouseLeave={() => setHl(null)}>
                <span className="dotc"><Glyph name={kindGlyph(a.kind, a.online)} /></span>
                <div className="body">
                  <div className="top"><b title={a.title}>{a.title}</b><span className="when">{shortDate(a.ms)}</span></div>
                  <div className="meta">{a.meta}</div>
                </div>
              </div>
            );
          })}
          <button className="ph-link" style={{ marginTop: 10 }} onClick={openHistory}>Open activity log {Icon.right(13)}</button>
        </div>
      </div>
    </div>
  );
}

export { anyMs };
