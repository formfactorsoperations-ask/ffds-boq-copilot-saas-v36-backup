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
  DrawingModel, DrawingCell, PaymentModel, GanttRow, GatePin, CostModel, ActivityItem,
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
  const seg = [
    { n: d.approved, c: 'var(--ph-ok)' }, { n: d.withClient, c: 'var(--ph-gold)' },
    { n: d.inRevision, c: 'var(--ph-b-tint)' }, { n: d.notIssued, c: 'var(--ph-line)' },
  ];
  const cols = `minmax(120px,1.2fr) ${d.types.map(() => 'minmax(0,1fr)').join(' ')}`;
  const cell = (c: DrawingCell | undefined, i: number, prefix?: string) => c ? (
    <button key={c.id} className={`ph-dcell ${c.state === 'none' ? '' : c.state}`} style={{ transitionDelay: `${i * 0.03}s` }}
      onClick={() => go('drawing-tracker')} {...tipProps(ui, cellTip(c))}>
      <span className="dt" />{prefix ? <><b style={{ color: 'var(--ph-ink-3)' }}>{prefix}</b>&nbsp;·&nbsp;</> : null}{STATE_LABEL[c.state]}
    </button>
  ) : <span key={`x${i}`} className="ph-dcell none-cell" />;

  let k = 0;
  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <div className="ph-dr-sum">
        <div className="big ph-num">{d.issued}<small> of {d.total} issued</small></div>
        <div className="ph-dr-bar">
          <div className="ph-dr-track">
            {seg.map((s, i) => <i key={i} style={{ background: s.c, width: armed ? `${(s.n / d.total) * 100}%` : 0 }} />)}
          </div>
          <div className="ph-legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: 'var(--ph-ok)' }} />Approved {d.approved}</span>
            <span><i style={{ background: 'var(--ph-gold)' }} />With client {d.withClient}</span>
            <span><i style={{ background: 'var(--ph-b-tint)' }} />In revision {d.inRevision}</span>
            <span><i style={{ background: '#fff', border: '1px dashed var(--ph-mut-3)' }} />Not issued {d.notIssued}</span>
          </div>
        </div>
        <button className="ph-btn sm" onClick={() => go('drawing-tracker')}>Open Drawing Tracker</button>
      </div>

      {d.rooms.length > 0 && (
        <div className="ph-dr-matrix" style={{ gridTemplateColumns: cols }}>
          <span className="h">Room</span>
          {d.types.map(t => <span key={t} className="h">{t}</span>)}
          {d.rooms.map(r => (
            <React.Fragment key={r.room}>
              <span className="rm" title={r.room}>{r.room}</span>
              {d.types.map(t => cell(r.cells[t], k++))}
            </React.Fragment>
          ))}
        </div>
      )}
      {d.wide.length > 0 && (
        <div style={{ marginTop: d.rooms.length ? 12 : 0 }}>
          {d.rooms.length > 0 && <div className="ph-eyebrow" style={{ marginBottom: 7 }}>Project-wide</div>}
          <div className="ph-dr-wide">{d.wide.map(c => cell(c, k++, c.name.length > 26 ? c.name.slice(0, 24) + '…' : c.name))}</div>
        </div>
      )}
      {sharedDocs.length > 0 && (
        <div className="ph-dr-shared">
          <span style={{ fontWeight: 700, color: 'var(--ph-ink-2)' }}>On the client&rsquo;s portal:</span>
          {sharedDocs.map(s => (
            <span key={s.name} className="th" {...tipProps(ui, <><b>{s.name}</b>{s.ms ? `Published ${shortDate(s.ms)}` : 'Published'}</>)}><i />{s.name}</span>
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
  const [hover, setHover] = useState(-1);
  const pm = payments;
  if (!pm.rungs.length) {
    return (
      <div className="ph-panel">
        <div className="ph-empty"><b>No payment schedule yet</b>Set one up in Money to see what is collected, due and later.
          <div style={{ marginTop: 12 }}><button className="ph-btn sm" onClick={() => go('payment-calc')}>Open Money</button></div></div>
      </div>
    );
  }
  const parts = [
    { value: pm.collected, colour: '#3F7D5B', label: 'Collected' },
    { value: pm.dueNow, colour: '#B5945B', label: 'Due now' },
    { value: pm.later, colour: '#DCE1EE', label: 'Later' },
  ];
  const ctr = hover < 0
    ? <><b className="ph-num">{inr(pm.collected)}</b><span>collected of {inr(pm.gross)}</span></>
    : <><b className="ph-num">{inr(parts[hover].value)}</b><span>{parts[hover].label} · {pm.gross ? ((parts[hover].value / pm.gross) * 100).toFixed(1) : 0}%</span></>;
  const shortName = (n: string) => n.replace('Material Order Advance', 'Material').replace('Completion & Handover', 'Handover');

  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <p className="ph-lede">Your terms put each payment <b>before</b> the work it releases. Hover any step to see its trigger.</p>
      <div className="ph-money-top">
        <Donut parts={parts} size={160} radius={66} width={15} play={armed} onHover={setHover}>{ctr}</Donut>
        <div>
          <div className="ph-gstat">
            <div className="ph-gs"><div className="k"><i style={{ background: 'var(--ph-ok)' }} />Collected</div><div className="v ph-num">{inr(pm.collected)}</div><div className="s">Paid so far, incl. any initiation fee</div></div>
            <div className="ph-gs"><div className="k"><i style={{ background: 'var(--ph-gold)' }} />Due now</div><div className="v ph-num">{inr(pm.dueNow)}</div><div className="s">{pm.due.length} payment{pm.due.length === 1 ? '' : 's'}, before the next releases</div></div>
            <div className="ph-gs"><div className="k"><i style={{ background: 'var(--ph-b-tint)' }} />Later</div><div className="v ph-num">{inr(pm.later)}</div><div className="s">{pm.laterCount} payment{pm.laterCount === 1 ? '' : 's'} still to come</div></div>
          </div>
          <div className="ph-ladder">
            {pm.rungs.map((r, i) => (
              <div key={r.id} className={`ph-rung ${r.state}`} style={{ flexGrow: Math.max(r.amount, 1) }}
                {...tipProps(ui, <><b>{r.name} · {inr(r.amount)}</b>{r.state === 'paid' ? 'Collected' : r.state === 'due' ? (r.invoiced ? 'Invoiced, awaiting payment' : 'Due now — not invoiced yet') : 'Later'}{r.trigger && <small>{r.trigger}</small>}</>)}>
                <i style={{ transitionDelay: `${i * 0.08}s` }} />
                <span className="lab">{inrShort(r.amount)}</span>
              </div>
            ))}
          </div>
          <div className="ph-lad-x">
            {pm.rungs.map(r => <span key={r.id} style={{ flexGrow: Math.max(r.amount, 1) }}>{shortName(r.name)}</span>)}
          </div>
          <div style={{ marginTop: 12 }}><button className="ph-link" onClick={() => go('payment-calc')}>Open Money {Icon.right(13)}</button></div>
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
  // The board leans with the cursor; kept above the empty-state return so hooks always run in the same order.
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
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
  const endPc = (r: GanttRow) => Math.min(100, pc(r.end) + 100 / span); // a task runs to the end of its last day

  /*
    Layout, top to bottom: month labels, the payments lane, then Design and Site
    groups. Everything is placed on one board so the board alone carries the 3D:
    grid on the floor, bars a little above it, tags and the today line higher still.
  */
  const lastDesignEnd = Math.max(0, ...rows.filter(r => r.kind === 'design').map(r => dayNum(r.end)));
  const inDesign = (r: GanttRow) => r.kind === 'design' || (r.kind === 'milestone' && dayNum(r.start) <= lastDesignEnd);
  const groups = [
    { name: 'Design', glyph: 'plan' as GlyphName, rows: rows.filter(inDesign) },
    { name: 'Site', glyph: 'hardhat' as GlyphName, rows: rows.filter(r => !inDesign(r)) },
  ].filter(g => g.rows.length);
  const ROW = 32, HEAD = 28, AXIS = 22;
  let y = AXIS + (pins.length ? 58 : 6);
  const placed: { r: GanttRow; y: number; i: number }[] = [];
  const heads: { name: string; glyph: GlyphName; y: number; h: number; n: number }[] = [];
  groups.forEach(g => {
    const top = y;
    y += HEAD;
    g.rows.forEach(r => { placed.push({ r, y, i: placed.length }); y += ROW; });
    heads.push({ name: g.name, glyph: g.glyph, y: top, h: y - top, n: g.rows.filter(r => r.kind !== 'milestone').length });
    y += 8;
  });
  const height = y + 18;
  const rowY = new Map(placed.map(p => [p.r.id, p.y]));
  // A payment tag hangs over the task it releases, with a thread down to that task's bar.
  const pinRow = (at: string) => rows.find(r => r.kind !== 'milestone' && (r.start === at || r.end === at));
  // Names sit beside their bar: after it while there is room, before it near the right edge, inside a very long bar.
  const side = (s: number, e: number) => e <= 62 ? 'after' : s >= 38 ? 'before' : 'inside';

  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ rx: +((0.5 - (e.clientY - r.top) / r.height) * 5).toFixed(2), ry: +(((e.clientX - r.left) / r.width - 0.5) * 6).toFixed(2) });
  };

  return (
    <div className={`ph-panel${armed ? ' ph-go' : ''}`}>
      <p className="ph-lede">
        {rows.length} tasks from {fmt(rows.map(r => r.start).sort()[0])} to a forecast handover on <b>{finishISO ? new Date(finishISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</b>.
        {pins.length > 0 && ' Gold tags mark payments due before the work they hang over.'}
      </p>
      <div className="ph-board-wrap" onPointerMove={onMove} onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}>
        <div className="ph-board" style={{ height, ['--rx' as any]: `${tilt.rx}deg`, ['--ry' as any]: `${tilt.ry}deg` }}>
          {/* floor: month bands and labels */}
          {months.map((m, i) => {
            const l = ((m / DAY - from) / span) * 100;
            const next = i + 1 < months.length ? ((months[i + 1] / DAY - from) / span) * 100 : 100;
            const d = new Date(m);
            return (
              <React.Fragment key={m}>
                <div className={`ph-b-month${i % 2 ? ' alt' : ''}`} style={{ left: `${l}%`, width: `${next - l}%`, top: AXIS }} />
                <span className="ph-b-mlabel" style={{ left: `${l}%` }}>
                  {d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}{d.getUTCMonth() === 0 ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ''}
                </span>
              </React.Fragment>
            );
          })}
          {heads.map(h => (
            <React.Fragment key={h.name}>
              <div className="ph-b-band" style={{ top: h.y, height: h.h }} />
              <span className="ph-b-sec" style={{ top: h.y + 5 }}><Glyph name={h.glyph} />{h.name}<small>{h.n} task{h.n === 1 ? '' : 's'}</small></span>
            </React.Fragment>
          ))}

          {/* the work */}
          {placed.map(({ r, y: ry, i }) => {
            const s = pc(r.start), e = endPc(r), sd = side(s, e);
            const tip = tipProps(ui, <><b>{r.title}</b>{fmt(r.start)}{r.end !== r.start ? ` – ${fmt(r.end)}` : ''}<small>{r.status.replace('_', ' ')}</small></>);
            if (r.kind === 'milestone') {
              return (
                <React.Fragment key={r.id}>
                  <button className={`ph-b-gem ${r.status}`} style={{ left: `${s}%`, top: ry + ROW / 2, ['--d' as any]: `${0.2 + i * 0.05}s` }}
                    onClick={() => go('timeline')} aria-label={`${r.title}, ${fmt(r.start)}`} {...tip} />
                  <span className={`ph-b-lbl ms ${s <= 62 ? 'after' : 'before'}`} style={s <= 62 ? { left: `calc(${s}% + 14px)`, top: ry + ROW / 2 } : { right: `calc(${100 - s}% + 14px)`, top: ry + ROW / 2 }}>{r.title}</span>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={r.id}>
                <button className={`ph-b-bar ${r.status}${r.kind === 'execution' ? ' exec' : ''}`}
                  style={{ left: `${s}%`, width: `${Math.max(0.8, e - s)}%`, top: ry + 9, ['--d' as any]: `${0.15 + i * 0.05}s` }}
                  onClick={() => go('timeline')} aria-label={`${r.title}, ${fmt(r.start)} to ${fmt(r.end)}`} {...tip}>
                  {sd === 'inside' && <span className="in">{r.title}</span>}
                </button>
                {sd !== 'inside' && (
                  <span className={`ph-b-lbl ${sd}`} style={sd === 'after'
                    ? { left: `calc(${e}% + 8px)`, top: ry + ROW / 2, maxWidth: `calc(${100 - e}% - 10px)` }
                    : { right: `calc(${100 - s}% + 8px)`, top: ry + ROW / 2, maxWidth: `calc(${s}% - 10px)` }}>{r.title}</span>
                )}
              </React.Fragment>
            );
          })}

          {/* payments, hanging over the work they release */}
          {pins.map((g, i) => {
            const x = pc(g.at), tagY = AXIS + 8 + (i % 2) * 24, target = pinRow(g.at), toY = target ? (rowY.get(target.id) || 0) + 9 : AXIS + 50;
            return (
              <React.Fragment key={g.name}>
                <span className="ph-b-thread" style={{ left: `${x}%`, top: tagY + 18, height: Math.max(0, toY - tagY - 18), ['--d' as any]: `${0.9 + i * 0.12}s` }} />
                <span className="ph-b-tag" style={{ left: `${x}%`, top: tagY, ['--d' as any]: `${0.9 + i * 0.12}s` }}
                  {...tipProps(ui, <><b>{g.name} · {g.label}</b>Due before the work it releases{g.trigger && <small>{g.trigger}</small>}</>)}>
                  <Glyph name="rupee" />{g.label}
                </span>
              </React.Fragment>
            );
          })}

          {today >= from && today <= to && (
            <div className="ph-b-today" style={{ left: `${((today - from + 0.5) / span) * 100}%`, top: AXIS - 4, height: height - AXIS - 4 }}><b>Today</b></div>
          )}
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
