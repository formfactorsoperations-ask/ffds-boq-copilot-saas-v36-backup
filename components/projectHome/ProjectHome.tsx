/**
 * Project Home — the project dashboard, v3.
 *
 * The approved design (public/mockups/project-home-v3-mockup.html), built on the
 * project's real records. Three rules hold the page together:
 *
 *   1. One red item: the single top blocker. Money that is due is gold; the rest
 *      is neutral.
 *   2. Each fact is stated once, where it can be acted on.
 *   3. The first screen is status plus three next steps. Charts live in one
 *      tabbed Insights card; margin and cost follow the P&L's own access rule.
 *
 * Everything the old dashboard could do is still reachable: stage advance,
 * realign, resume, modify brief, the legacy-architecture upgrade, the full P&L,
 * the AI risk alerts, logging, site-visit history, and — from stage 5 — the
 * procurement gate and handover checklist.
 *
 * Surface (approved in public/mockups/project-home-3d-mockup.html): frosted
 * cards over a soft indigo-and-gold wash; a status-only header with the phases
 * as a 3D stack; one line-icon set that draws itself; figures and side cards
 * that lean toward the cursor; and a Record card for site visits, meetings
 * and decisions (keys S, M, D).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db as fsDb } from '../../services/firebaseClient';
import { db as storageDb } from '../../services/dbService';
import type { ProjectContext, FullBoqItem, DrawingTrackerItem, MOM, ProjectSchedule, PurchaseOrder } from '../../types';
import type { JourneyContextType } from '../../services/journeyEngine';
import type { NextAction } from '../../services/nextActionEngine';
import { PHASES, STAGE_LABELS } from '../../constants/journeyConstants';
import { computeSchedule as computePayments } from '../../lib/paymentSchedule';
import { computeSchedule as computeProgramme } from '../../lib/schedule';
import { buildScheduleFromProject } from '../../lib/scheduleBuilder';
import { useTimelinePhases } from '../../hooks/useTimelinePhases';
import { buildProjectPnl, CONFIDENCE_LABEL } from '../../lib/projectPnl';
import { resolveDocumentState } from '../../services/documentIssueEngine';
import { issuePortalAccess } from '../../services/portalAccessService';
import { readPortalView } from '../../services/portalViewService';
import { buildPortalView, portalViewSummary } from '../../lib/portalProjection';
import { isVisibleToClient } from '../../lib/clientVisibility';
import ProjectPnlCard from '../ops/ProjectPnlCard';
import { ProcurementGateWidget } from '../ProcurementGateWidget';
import { HandoverReadinessWidget } from '../HandoverReadinessWidget';
import {
  journeyStrip, drawingModel, paymentModel, gatePins, costModel, activityItems, studioFollowUps, portalModel,
  inr, shortDate, anyMs, GanttRow, isoOf, dayNum,
} from '../../lib/projectHome';
import { Icon, Ring, UiProvider, useUi, useCountUp, useArmed, tipProps, Glyph, GlyphName } from './bits';
import InsightsCard, { InsightTab } from './InsightsCard';
import './projectHome.css';

export interface ProjectHomeProps {
  projectId: string;
  studioId: string;
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  setActiveTab: (tab: string) => void;
  activeTier: any;
  tiers: any[];
  fullBoq: FullBoqItem[];
  currentUserRole: string;
  journey: JourneyContextType;
  nextActions: NextAction[];
  stage: number;
  actualPhaseIdx: number;
  isMismatch: boolean;
  advanceLifecycle: (stage: number) => Promise<void>;
  onLogSiteVisit: () => void;
  onLogMeeting: () => void;
  onOpenHistory: () => void;
  modalOpen: boolean;
  projectArchitecture?: string;
  onUpgradeArchitecture?: () => void;
  onModifyBrief?: () => void;
  onResumeProject: () => void;
  sofItems: any[];
  selections: any[];
}

export default function ProjectHome(props: ProjectHomeProps) {
  return <UiProvider><Home {...props} /></UiProvider>;
}

/* "Prepare Execution Agreement" → "prepare execution agreement"; codes like E1, D2, BOQ, GST keep their case. */
function asSentence(title: string) {
  return title.split(' ').map((w, i) =>
    /\d|^[A-Z]{2,}$|₹/.test(w) ? w : (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1).toLowerCase() : w.toLowerCase()),
  ).join(' ');
}

/* The async clipboard needs a focused page and permission; the old copy command often works when it does not. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

function Home(p: ProjectHomeProps) {
  const ui = useUi();
  const ctx: any = p.projectContext || {};
  const go = (route: string) => { if (route) p.setActiveTab(route); };
  // Mirrors ProjectPnlCard, which withholds the P&L from Designers and no one else.
  const canSeeMoney = p.currentUserRole !== 'Designer';

  /* ───────────── live records ───────────── */
  const [drawItems, setDrawItems] = useState<DrawingTrackerItem[] | null>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [moms, setMoms] = useState<MOM[]>([]);
  const [savedSchedule, setSavedSchedule] = useState<ProjectSchedule | null | undefined>(undefined);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [sent, setSent] = useState<{ summary: { section: string; count: number }[]; builtAt: string } | null | undefined>(undefined);
  const { phases } = useTimelinePhases(p.projectId, p.studioId);

  useEffect(() => {
    if (!fsDb || !p.projectId || !p.studioId) return;
    const base = `organizations/${p.studioId}/projects/${p.projectId}`;
    // Each listener has its own error path: an unhandled one stalls Firestore's queue for the whole page.
    const u1 = onSnapshot(collection(fsDb, `${base}/drawingTracker`),
      s => setDrawItems(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => setDrawItems([]));
    const u2 = onSnapshot(query(collection(fsDb, `${base}/siteVisits`), orderBy('date', 'desc')),
      s => setVisits(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setVisits([]));
    const u3 = onSnapshot(collection(fsDb, `${base}/moms`),
      s => setMoms(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => setMoms([]));
    return () => { u1(); u2(); u3(); };
  }, [p.projectId, p.studioId]);

  useEffect(() => {
    let alive = true;
    if (!p.projectId) return;
    storageDb.getSchedule(p.projectId).then(s => alive && setSavedSchedule(s || null)).catch(() => alive && setSavedSchedule(null));
    storageDb.getPurchaseOrders(p.projectId).then(r => alive && setPos(r || [])).catch(() => alive && setPos([]));
    readPortalView(p.projectId)
      .then(v => alive && setSent(v ? { summary: portalViewSummary(v), builtAt: v.builtAt } : null))
      .catch(() => alive && setSent(null));
    return () => { alive = false; };
  }, [p.projectId]);

  /* ───────────── models ───────────── */
  const journey = p.journey;
  const activeIdx = journey.activeSteps.length > 0
    ? journey.activeSteps[0].phase
    : (journey.overall.done === journey.overall.total ? PHASES.length - 1 : 0);
  const strip = useMemo(() => journeyStrip(journey.stepsByPhase, journey.phaseProgress, activeIdx), [journey.stepsByPhase, journey.phaseProgress, activeIdx]);
  const roomNames = useMemo(() => (ctx.rooms || []).map((r: any) => r.name), [ctx.rooms]);
  const drawings = useMemo(() => drawItems ? drawingModel(drawItems, roomNames) : null, [drawItems, roomNames]);

  const payResult = useMemo(() => {
    try { return computePayments({ context: ctx, tierSummary: p.activeTier?.summary }); } catch { return null; }
  }, [ctx, p.activeTier]);
  const payments = useMemo(() => paymentModel(payResult, ctx.paymentMilestones || [], journey.phaseProgress), [payResult, ctx.paymentMilestones, journey.phaseProgress]);

  const programme = useMemo(() => {
    if (savedSchedule === undefined) return { rows: [] as GanttRow[], finishISO: null as string | null, targetISO: null as string | null };
    try {
      const schedule = savedSchedule || buildScheduleFromProject(ctx, p.fullBoq, { designSteps: phases as any });
      const r = computeProgramme(schedule);
      const rows: GanttRow[] = r.tasks
        .map((t: any) => ({ id: t.id, title: t.title, kind: t.kind, start: t.plannedStartISO || t.startISO, end: t.plannedEndISO || t.endISO, status: t.status || 'pending' }))
        .filter(t => t.start && t.end)
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
      return { rows, finishISO: r.finishISO, targetISO: (schedule as any).targetHandoverISO || null };
    } catch { return { rows: [] as GanttRow[], finishISO: null, targetISO: null }; }
  }, [savedSchedule, ctx, p.fullBoq, phases]);
  const pins = useMemo(() => gatePins(payments.due, programme.rows), [payments.due, programme.rows]);
  const designDone = (journey.phaseProgress[1]?.pct || 0) >= 100;
  const programmeStale = designDone && programme.rows.some(r => r.kind === 'design' && r.status !== 'completed');

  const cost = useMemo(() => costModel(p.fullBoq, ctx.rooms || []), [p.fullBoq, ctx.rooms]);
  const pnl = useMemo(() => {
    try { return buildProjectPnl(ctx, p.fullBoq, pos, p.activeTier, ctx.procurementModes || {}); } catch { return null; }
  }, [ctx, p.fullBoq, pos, p.activeTier]);

  const paidAmounts = useMemo(() => new Map((payResult?.amounts || []).filter(a => a.status === 'paid').map(a => [a.id, a.invoiceTotal])), [payResult]);
  const activity = useMemo(() => activityItems({
    visits, milestones: ctx.paymentMilestones || [], paidAmounts, decisions: ctx.projectDecisions || [], steps: journey.steps,
  }), [visits, ctx.paymentMilestones, paidAmounts, ctx.projectDecisions, journey.steps]);
  const liveVisits = visits.filter(v => v.status !== 'cancelled');
  const siteCount = liveVisits.filter(v => v.type === 'site_visit').length;
  const meetCount = liveVisits.length - siteCount;
  // Meeting hours only: the chip reads "3 meetings · N h", so site-visit time stays out of it.
  const hours = Math.round(liveVisits.filter(v => v.type !== 'site_visit').reduce((s, v) => s + (Number(v.durationMinutes) || 0), 0) / 6) / 10;
  const lastLogged = liveVisits.map(v => anyMs(v.date)).filter(Boolean).sort((a, b) => b - a)[0];
  // The counts live in the timeline's summary chips; this line only dates the last contact.
  const activitySummary = lastLogged
    ? `Last meeting or site visit: ${shortDate(lastLogged)}.`
    : 'No meetings or site visits logged yet.';

  const followUps = useMemo(() => studioFollowUps(moms), [moms]);
  const portal = useMemo(() => {
    if (sent === undefined) return null;
    let current: { section: string; count: number }[] = [];
    try { current = portalViewSummary(buildPortalView(p.projectId, ctx)); } catch { /* compare nothing rather than guess */ }
    return portalModel(sent?.summary || null, sent?.builtAt || null, current, ctx.portalAccess, programme.rows.length > 0);
  }, [sent, ctx, p.projectId, programme.rows.length]);

  const sharedDocs = useMemo(() => (ctx.designDocuments || [])
    .filter((d: any) => isVisibleToClient(d))
    .map((d: any) => ({ name: d.name || d.title || 'Drawing', ms: anyMs(d.clientVisibility?.publishedAt) || anyMs(d.uploadedAt) })), [ctx.designDocuments]);

  /* ───────────── page-level state ───────────── */
  const [jump, setJump] = useState<{ tab: InsightTab; n: number } | null>(null);
  const openInsight = (tab: InsightTab) => {
    setJump(j => ({ tab, n: (j?.n || 0) + 1 }));
    window.setTimeout(() => document.getElementById('ph-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const [moreOpen, setMoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [stageMenu, setStageMenu] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (shareRef.current && !shareRef.current.contains(t)) setShareOpen(false);
      if (stageRef.current && !stageRef.current.contains(t)) setStageMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /* ───────────── record ───────────── */
  const [flash, setFlash] = useState<{ k: string; n: number } | null>(null);
  const record = (k: 's' | 'm' | 'd') => {
    setFlash(f => ({ k, n: (f?.n || 0) + 1 }));
    if (k === 's') p.onLogSiteVisit();
    else if (k === 'm') p.onLogMeeting();
    else go('record-decision');
  };
  // S, M and D record straight away. Never while typing, or while a dialog is open.
  const keyState = useRef({ modalOpen: p.modalOpen, record });
  keyState.current = { modalOpen: p.modalOpen, record };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || keyState.current.modalOpen) return;
      const el = e.target as HTMLElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { setStageMenu(false); setShareOpen(false); return; }
      if (k === 's' || k === 'm' || k === 'd') { e.preventDefault(); keyState.current.record(k); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ───────────── tilt ───────────── */
  // One listener for the whole page: figures and side cards lean toward the cursor.
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const onTiltMove = (e: React.PointerEvent) => {
    if (reduceMotion || e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest('.ph-tilt') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const px = clamp((e.clientX - r.left) / r.width), py = clamp((e.clientY - r.top) / r.height);
    const k = el.classList.contains('ph-kpi') ? 1 : 0.4; // tall cards lean less
    el.style.setProperty('--rx', `${((0.5 - py) * 10 * k).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((px - 0.5) * 12 * k).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  };
  const onTiltOut = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('.ph-tilt') as HTMLElement | null;
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  /* ───────────── portal link ───────────── */
  const [confirmRenew, setConfirmRenew] = useState(false);
  // Renewing revokes the link the client already has, so it takes a second click — and the first one expires.
  useEffect(() => {
    if (!confirmRenew) return;
    const t = window.setTimeout(() => setConfirmRenew(false), 5000);
    return () => window.clearTimeout(t);
  }, [confirmRenew]);
  const issueLink = () => {
    const access = issuePortalAccess(p.projectId, ctx.clientEmail);
    p.setProjectContext(prev => ({ ...(prev as any), portalAccess: access }));
    return access;
  };
  const renewLink = () => {
    if (!confirmRenew) { setConfirmRenew(true); return; }
    setConfirmRenew(false);
    issueLink();
    ui.say('New client link issued — the old one has stopped working');
  };
  const copyLink = async () => {
    setShareOpen(false);
    const existing = ctx.portalAccess;
    const live = existing?.token && (!existing.expiresAt || anyMs(existing.expiresAt) > Date.now());
    const token = live ? existing.token : issueLink().token;
    const link = `${window.location.origin}/?portal=${token}`;
    const copied = await copyText(link);
    if (copied) ui.say(live ? 'Client link copied' : 'New client link copied — any earlier link has stopped working');
    else ui.say(live ? 'The browser blocked copying. Try again, or copy it from the Client portal screen.'
      : 'New link issued, but the browser blocked copying. Copy it from the Client portal screen.');
  };

  /* ───────────── header ───────────── */
  const paused = ctx.status === 'work_paused';
  const top = p.nextActions[0] || null;
  const headline = paused ? <>This project is paused.</>
    : top ? <><span className="dim">Next:</span> {asSentence(top.title)}.</>
    : <>Nothing is waiting on you.</>;
  const sub = paused ? 'Resume it to bring back the next steps and alerts.'
    : top ? top.why
    : strip[activeIdx] ? `${strip[activeIdx].name} is in progress — ${strip[activeIdx].done} of ${strip[activeIdx].total} steps done.` : '';

  const advance = stageAdvance(p.stage, ctx, journey);
  const canModifyBrief = !ctx.approvedTierId && !ctx.lifecycle?.gates?.proposalAccepted?.done && p.stage < 3 && !!p.onModifyBrief;

  /* ───────────── up next ───────────── */
  const rows = buildRows({
    p, ctx, go, openInsight, drawings, payments, programmeRows: programme.rows, followUps, activeIdx, strip,
  });
  const visibleRows = rows.slice(0, 3);
  const moreRows = rows.slice(3);

  /* ───────────── KPIs ───────────── */
  const armed = useArmed(400);
  const collected = useCountUp(payments.collected, armed);
  const marginVal = useCountUp(pnl ? pnl.currentMargin : 0, armed);
  const collectedPct = payments.gross ? (payments.collected / payments.gross) * 100 : 0;
  const stepsDone = useCountUp(journey.overall.done, armed, 900);
  const pctDone = useCountUp(journey.overall.pct, armed, 900);

  const stageName = STAGE_LABELS[p.stage] || '';
  const tierName = String((p.tiers || []).find((t: any) => t.id === ctx.approvedTierId)?.name || p.activeTier?.name || '').replace(/\s*\(.*\)\s*$/, '');

  return (
    <div className="ph" onPointerMove={onTiltMove} onPointerOut={onTiltOut}>
      {p.projectArchitecture === 'legacy' && (
        <div className="ph-banner" style={{ marginBottom: 14 }}>
          {Icon.info()}<span><b>Legacy project architecture.</b> Upgrade to the canonical model for better isolation and reliability.</span>
          <span className="sp" />
          {p.onUpgradeArchitecture && <button className="ph-btn sm" onClick={p.onUpgradeArchitecture}>Upgrade now</button>}
        </div>
      )}

      <div className="ph-grid">
        <div className="ph-main">

          {/* ═══ status ═══ */}
          {/* Status only: every action lives in Up next; stage moves sit in the corner. */}
          <section className="ph-card ph-hero ph-rise" style={{ animationDelay: '.02s' }}>
            <span className="ph-hero-clip" />
            {(advance || canModifyBrief) && (
              <div className={`ph-split ph-corner${stageMenu ? ' open' : ''}`} ref={stageRef}>
                <button className="ph-btn icon" title="Stage and project settings" aria-label="Stage and project settings" aria-haspopup="menu"
                  aria-expanded={stageMenu} onClick={() => setStageMenu(o => !o)}>{Icon.more(16)}</button>
                <div className="ph-menu" role="menu" style={{ width: 272 }}>
                  {advance && (
                    <button className="ph-mi" role="menuitem" disabled={advance.disabled}
                      onClick={() => { setStageMenu(false); if (advance.to) p.advanceLifecycle(advance.to); else if (advance.tab) go(advance.tab); }}>
                      <span className="ico">{Icon.arrow()}</span><span className="t">{advance.label}<small>{advance.sub}</small></span>
                    </button>
                  )}
                  {canModifyBrief && (
                    <button className="ph-mi" role="menuitem" onClick={() => { setStageMenu(false); p.onModifyBrief?.(); }}>
                      <span className="ico">{Icon.refresh()}</span><span className="t">Modify project brief<small>Re-run the setup wizard</small></span>
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="ph-hero-top">
              <div className="ph-hero-l">
                <span className="ph-eyebrow">Stage {p.stage} of 6 · {stageName}</span>
                <h1>{headline}</h1>
                {sub && <p className="sub">{sub}</p>}
              </div>
              <PhaseStack strip={strip} />
            </div>

            <Journey strip={strip} activeIdx={activeIdx} journey={journey} stepsDone={Math.round(stepsDone)} pctDone={Math.round(pctDone)}
              drawings={drawings} go={go} />
          </section>

          {/* ═══ figures ═══ */}
          <div className={`ph-kpis${canSeeMoney ? '' : ' k3'}`}>
            <button className="ph-card ph-kpi ph-tilt ph-rise" style={{ animationDelay: '.06s' }} onClick={() => openInsight('money')}>
              <Ring pct={collectedPct} colour="#3F7D5B" label={payments.gross ? `${Math.round(collectedPct)}%` : '—'} />
              <div><div className="l">Collected</div>
                <div className="v ph-num">{payments.gross ? inr(collected) : '—'}</div>
                <div className="s">{payments.gross ? `of ${inr(payments.gross)}` : 'No payment schedule yet'}</div></div>
            </button>
            {canSeeMoney && (
              <button className="ph-card ph-kpi ph-tilt ph-rise" style={{ animationDelay: '.09s' }} onClick={() => openInsight('cost')}>
                <Ring pct={pnl ? pnl.currentMarginPct : 0} colour="#3D52A0" label={pnl && pnl.contractedTotal ? `${Math.round(pnl.currentMarginPct)}%` : '—'} />
                <div><div className="l">Margin</div>
                  <div className="v ph-num">{pnl && pnl.contractedTotal ? `₹${(marginVal / 1e5).toFixed(2)}L` : '—'}</div>
                  <div className="s">{pnl && pnl.contractedTotal ? (pnl.confidence === 'plan-only' ? 'BOQ estimate' : CONFIDENCE_LABEL[pnl.confidence]) : 'No contract yet'}</div></div>
              </button>
            )}
            <button className="ph-card ph-kpi ph-tilt ph-rise" style={{ animationDelay: '.12s' }} onClick={() => openInsight('draw')}>
              <Ring pct={drawings && drawings.total ? (drawings.issued / drawings.total) * 100 : 0} colour="#3D52A0"
                label={drawings && drawings.total ? `${drawings.issued}/${drawings.total}` : '—'} />
              <div><div className="l">Drawings</div>
                <div className="v">{drawings ? (drawings.total ? <><span className="ph-num">{drawings.issued}</span> of {drawings.total} issued</> : 'None yet') : '…'}</div>
                <div className="s">{drawings && drawings.total ? `working set · ${drawings.approved} approved` : 'Drawing Tracker'}</div></div>
            </button>
            <button className="ph-card ph-kpi ph-tilt ph-rise" style={{ animationDelay: '.15s' }} onClick={() => openInsight('prog')}>
              <div className="ph-ico2"><Glyph name="key" /></div>
              <div><div className="l">Handover</div>
                <div className="v">{programme.finishISO ? new Date(programme.finishISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ (\d{2})$/, " ’$1") : '—'}</div>
                <div className="s">{programme.targetISO ? `forecast · target ${new Date(programme.targetISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : programme.finishISO ? 'forecast · no target set' : 'No programme yet'}</div></div>
            </button>
          </div>

          {/* ═══ up next ═══ */}
          <section className="ph-card ph-rise" style={{ animationDelay: '.1s' }}>
            <div className="ph-sec-h"><h2>Up next</h2><span className="ph-count">{rows.length}</span><span className="sp" /><span className="hint">Most important first</span></div>
            {rows.length === 0 && <div className="ph-empty"><b>You&rsquo;re clear</b>Nothing needs you on this project right now.</div>}
            {visibleRows.map(r => <UpNextRow key={r.key} r={r} />)}
            {moreRows.length > 0 && (
              <>
                <div className={`ph-more-wrap${moreOpen ? ' open' : ''}`}><div>{moreRows.map(r => <UpNextRow key={r.key} r={r} />)}</div></div>
                <button className="ph-more-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
                  {moreOpen ? 'Show less' : `Show ${moreRows.length} more`}<span className="ph-chev" style={{ display: 'inline-flex' }}>{Icon.chev(13)}</span>
                </button>
              </>
            )}
          </section>

          {/* ═══ insights ═══ */}
          <InsightsCard
            stage={p.stage}
            canSeeMoney={canSeeMoney}
            drawings={drawings}
            sharedDocs={sharedDocs}
            payments={payments}
            programme={{ rows: programme.rows, pins, finishISO: programme.finishISO, stale: programmeStale }}
            cost={cost}
            marginLine={pnl && pnl.contractedTotal
              ? <><b>{inr(pnl.currentMargin)} margin ({pnl.currentMarginPct.toFixed(1)}%)</b> on {inr(pnl.contractedTotal)} contracted. {pnl.confidence === 'plan-only' ? 'Nothing is ordered yet, so this is the BOQ’s estimate.' : `${CONFIDENCE_LABEL[pnl.confidence]}.`}</>
              : <>No contract value yet, so there is no margin to show.</>}
            pnlCard={<ProjectPnlCard projectContext={p.projectContext} boq={p.fullBoq} projectId={p.projectId} activeTier={p.activeTier}
              currentUserRole={p.currentUserRole} onOpenProcurement={() => go('materials')} />}
            activity={activity}
            activitySummary={activitySummary}
            activityStats={{ meetings: meetCount, sites: siteCount, hours, decisions: (ctx.projectDecisions || []).length, received: payments.collected }}
            jump={jump}
            go={go}
            openHistory={p.onOpenHistory}
            onPlanCheckIn={() => record('m')}
          />

          {/* ═══ site readiness — from the stage it can act in ═══ */}
          {p.stage >= 5 && (
            <div className="ph-rise" style={{ animationDelay: '.2s', display: 'grid', gridTemplateColumns: p.stage >= 6 ? 'repeat(auto-fit,minmax(300px,1fr))' : '1fr', gap: 14 }}>
              <ProcurementGateWidget paymentMilestones={ctx.paymentMilestones || []} sofItems={p.sofItems} onOpenLedger={() => go('payment-calc')} />
              {p.stage >= 6 && (
                <HandoverReadinessWidget paymentMilestones={ctx.paymentMilestones || []} snagList={ctx.snagList || []} sofItems={p.sofItems}
                  selections={p.selections || []} onOpenSiteOps={() => go('site-ops')} currentStage={p.stage} />
              )}
            </div>
          )}
        </div>

        {/* ═══ rail ═══ */}
        <aside className="ph-rail">
          <RecordCard record={record} flash={flash} />

          <PortalCard portal={portal} go={go} renew={renewLink} confirmRenew={confirmRenew} copyLink={copyLink}
            shareOpen={shareOpen} setShareOpen={setShareOpen} shareRef={shareRef} />

          <section className="ph-card ph-box ph-tilt ph-rise" style={{ animationDelay: '.08s' }}>
            <h3><span className="ph-hi"><Glyph name="home" /></span>Details</h3>
            <div className="ph-kv"><span className="k">Client</span><span className="v" title={ctx.clientName}>{ctx.clientName || '—'}</span></div>
            <div className="ph-kv"><span className="k">Area</span><span className="v">{ctx.area ? `${ctx.area} sqft` : '—'}{ctx.location ? ` · ${ctx.location}` : ''}</span></div>
            <div className="ph-kv"><span className="k">Scope</span><span className="v">{(ctx.rooms || []).length} rooms · {p.fullBoq.length} lines</span></div>
            {tierName && <div className="ph-kv"><span className="k">Tier</span><span className="v" title={tierName}>{tierName}</span></div>}
            <div className="ph-kv"><span className="k">Status</span><span className="v"><span className="ph-bdg ok">{String(ctx.status || 'lead').replace(/_/g, ' ')}</span></span></div>
            <div className="pad-b" />
          </section>

          <WaitingCard decisions={ctx.projectDecisions || []} go={go} />

          <ComingUp journey={journey} activeIdx={activeIdx} stage={p.stage} payments={payments} />
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────────── journey strip ───────────────────────────── */

function Journey({ strip, activeIdx, journey, stepsDone, pctDone, drawings, go }: {
  strip: ReturnType<typeof journeyStrip>; activeIdx: number; journey: JourneyContextType;
  stepsDone: number; pctDone: number; drawings: ReturnType<typeof drawingModel> | null; go: (r: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const armed = useArmed(300);
  const cols = strip.map(s => `minmax(${s.name.length > 11 ? 86 : 74}px,${Math.max(1, s.total)}fr)`).join(' ');
  const steps = journey.stepsByPhase[activeIdx] || [];
  const phaseName = strip[activeIdx]?.name || 'Current';
  return (
    <div className="ph-journey">
      <div className="ph-jr-top">
        <span className="big"><span className="ph-num">{stepsDone}</span> of {journey.overall.total} steps</span>
        <span className="mut">· <span className="ph-num">{pctDone}</span>% through the project</span>
        <span className="sp" />
        {steps.length > 0 && (
          <button className="ph-link" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {phaseName} steps <span className="ph-chev" style={{ display: 'inline-flex' }}>{Icon.chev(13)}</span>
          </button>
        )}
        <button className="ph-link" onClick={() => go('project-journey')}>Ops Matrix {Icon.right(13)}</button>
      </div>
      <div className="ph-jr-scroll">
        <div className="ph-cols6" style={{ gridTemplateColumns: cols }}>
          {strip.map((s, i) => (
            <div key={s.index} className={`ph-seg6 ${s.state === 'done' ? 'done' : s.state === 'now' ? 'now' : ''}`}>
              <i style={{ width: armed ? `${s.total ? (s.done / s.total) * 100 : 0}%` : 0, transitionDelay: `${i * 0.11}s` }} />
            </div>
          ))}
        </div>
        <div className="ph-cols6 ph-lbls" style={{ gridTemplateColumns: cols }}>
          {strip.map(s => <div key={s.index} className={`ph-lb ${s.state === 'done' ? 'done' : s.state === 'now' ? 'now' : ''}`}><b>{s.name}</b>{s.note}</div>)}
        </div>
      </div>
      <div className={`ph-drawer${open ? ' open' : ''}`}><div>
        <div className="ph-steps">
          {steps.map(s => {
            const done = s.status === 'done';
            const when = s.completedAt ? shortDate(s.completedAt.getTime()) : '';
            const meta = done
              ? [s.isAutoDerived ? 'Automatic' : (s.completedByName ? `By ${s.completedByName}` : 'Done'), when].filter(Boolean).join(' · ')
              : s.id === 'working_drawings_done' && drawings && drawings.total
                ? `${drawings.issued} of ${drawings.total} issued in the Drawing Tracker`
                : s.statusSource === 'manual' ? 'Needs your sign-off' : 'Ticks itself when the work is recorded';
            // The step's own link is Site Ops, but its line here counts the Drawing Tracker — go where it points.
            const link = s.id === 'working_drawings_done' ? 'drawing-tracker'
              : s.linkedTab && s.linkedTab !== 'dashboard' ? s.linkedTab : null;
            const inner = <>
              <span className="st">{done ? Icon.check(11) : null}</span>
              <div><div className="nm">{s.title}</div><div className="mt">{meta}</div></div>
            </>;
            return link
              ? <button key={s.id} className={`ph-step ${done ? 'done' : 'open'}`} onClick={() => go(link)}>{inner}</button>
              : <div key={s.id} className={`ph-step ${done ? 'done' : 'open'}`}>{inner}</div>;
          })}
        </div>
      </div></div>
    </div>
  );
}

/* ───────────────────────────── up next rows ───────────────────────────── */

interface Row {
  key: string;
  tone: 'lead' | 'gold' | 'b' | 'mut';
  icon: React.ReactNode;
  title: React.ReactNode;
  badge?: { text: string; tone: 'bad' | 'gold' | 'b' | 'mut' };
  desc?: React.ReactNode;
  note?: React.ReactNode;
  why?: string;
  list?: { text: string; due: number | null }[];
  actions: { label: string; primary?: boolean; onClick: () => void }[];
}

const UpNextRow: React.FC<{ r: Row }> = ({ r }) => {
  return (
    <div className={`ph-row${r.tone === 'lead' ? ' lead' : ''}`}>
      <span className={`ph-ic ${r.tone === 'lead' ? 'bad' : r.tone === 'gold' ? 'gold' : r.tone === 'b' ? 'b' : 'mut'}`}>{r.icon}</span>
      <div className="bd">
        <div className="tt">{r.title}{r.badge && <span className={`ph-bdg ${r.badge.tone}`}>{r.badge.text}</span>}</div>
        {r.desc && <div className="ds">{r.desc}</div>}
        {r.list && (
          <ul className="ph-mini-list">
            {r.list.map((it, i) => (
              <li key={i}><span className="ph-check" /><span style={{ flex: 1 }}>{it.text}</span>{it.due ? <span className="due">due {shortDate(it.due)}</span> : null}</li>
            ))}
          </ul>
        )}
        {r.note && <div className="note">{r.note}</div>}
        {r.why && <details className="ph-why"><summary>Why this ›</summary><p>{r.why}</p></details>}
      </div>
      {r.actions.length > 0 && (
        <div className="act">
          {r.actions.map(a => <button key={a.label} className={`ph-btn sm${a.primary ? ' pri' : ''}`} onClick={a.onClick}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
};

function buildRows(a: {
  p: ProjectHomeProps; ctx: any; go: (r: string) => void; openInsight: (t: InsightTab) => void;
  drawings: ReturnType<typeof drawingModel> | null; payments: ReturnType<typeof paymentModel>;
  programmeRows: GanttRow[]; followUps: ReturnType<typeof studioFollowUps>; activeIdx: number;
  strip: ReturnType<typeof journeyStrip>;
}): Row[] {
  const { p, ctx, go, openInsight, drawings, payments, programmeRows, followUps } = a;
  const rows: Row[] = [];
  // Paused: the only thing to do is resume — the header no longer carries a button for it.
  if (ctx.status === 'work_paused') {
    rows.push({ key: 'resume', tone: 'b', icon: <Glyph name="pause" />, title: 'Resume the project',
      desc: <>Work is paused. Resuming brings back the next steps and alerts.</>,
      actions: [{ label: 'Resume project', primary: true, onClick: p.onResumeProject }] });
    return rows;
  }
  const today = isoOf(Date.now());
  const engine = p.nextActions || [];
  const leadIdx = engine.findIndex(x => x.priority === 'blocker');

  // 1 — the single red item: the engine's top blocker.
  if (leadIdx >= 0) {
    const x = engine[leadIdx];
    const nextSite = p.stage < 5 ? programmeRows.find(r => r.kind === 'execution' && r.status !== 'completed' && r.start >= today) : undefined;
    rows.push({
      key: `eng-${x.id}`, tone: 'lead', icon: <Glyph name={engineGlyph(x)} />, title: x.title, badge: { text: 'Blocker', tone: 'bad' },
      // The engine's own reason is already the header's sub-line; say what it holds up instead.
      desc: nextSite
        ? <><b>{nextSite.title}</b> is planned for <b>{shortDate(dayNum(nextSite.start) * 86400000)}</b>. It can&rsquo;t start until this is done.</>
        : undefined,
      actions: [{ label: x.ctaLabel, primary: true, onClick: () => go(x.route) }],
    });
  }

  // 2 — design money behind the work it was meant to precede.
  const designDone = (p.journey.phaseProgress[1]?.pct || 0) >= 100;
  const engineHasDesignMoney = engine.some(x => /d2|d3|design advance|design.*payment/i.test(x.title));
  const owed = designDone && !engineHasDesignMoney ? payments.due.find(r => r.type === 'design' && !r.invoiced && !/gfc|good.for.construction/i.test(r.trigger)) : undefined;
  if (owed) {
    rows.push({
      key: `pay-${owed.id}`, tone: 'gold', icon: <Glyph name="invoice" />, title: <>Invoice {owed.name} · {inr(owed.amount)}</>,
      desc: owed.trigger ? <>Due &ldquo;{owed.trigger.replace(/\.$/, '')}&rdquo; &mdash; that work is done, and this hasn&rsquo;t been invoiced yet.</> : <>Design is complete, and this hasn&rsquo;t been invoiced yet.</>,
      actions: [{ label: 'Raise invoice', onClick: () => go('payment-calc') }],
    });
  }

  // 3 — the Ops Matrix's next step, checked against the Drawing Tracker.
  const ns = p.journey.nextStep;
  if (ns) {
    const gfcMoney = payments.due.find(r => !r.invoiced && /gfc|good.for.construction/i.test(r.trigger));
    if (ns.id === 'working_drawings_done' && drawings && drawings.total > 0 && drawings.issued < drawings.total) {
      rows.push({
        key: 'drawings', tone: 'b', icon: <Glyph name="plan" />, title: 'Issue the working drawings',
        badge: { text: `${drawings.issued} of ${drawings.total}`, tone: 'b' },
        desc: <>The Ops Matrix is waiting on your GFC sign-off, but the Drawing Tracker hasn&rsquo;t issued {drawings.issued === 0 ? 'any' : `all`} of the {drawings.total} drawings yet. Issue them there, and the sign-off follows.</>,
        note: gfcMoney ? <>Your terms bill <b>{gfcMoney.name} ({inr(gfcMoney.amount)})</b> before these go to the client.</> : undefined,
        actions: [{ label: 'See drawings', onClick: () => openInsight('draw') }],
      });
    } else {
      const link = ns.id === 'working_drawings_done' ? 'drawing-tracker'
        : ns.linkedTab && ns.linkedTab !== 'dashboard' ? ns.linkedTab : null;
      const acts: Row['actions'] = [];
      if (ns.statusSource === 'manual') acts.push({ label: 'Mark done', onClick: () => p.journey.markStepDone(ns.id) });
      if (link) acts.push({ label: 'Open', onClick: () => go(link) });
      rows.push({
        key: `step-${ns.id}`, tone: 'b', icon: <Glyph name="flag" />, title: ns.title,
        badge: { text: ns.statusSource === 'manual' ? 'Your sign-off' : 'Milestone', tone: 'b' },
        desc: ns.description, actions: acts,
      });
    }
  }

  // 4 — the rest of the engine's list.
  engine.forEach((x, i) => {
    if (i === leadIdx) return;
    rows.push({
      key: `eng-${x.id}`, tone: x.priority === 'suggested' ? 'mut' : 'b',
      icon: <Glyph name={engineGlyph(x)} />,
      title: x.title, badge: x.priority === 'blocker' ? { text: 'Also blocking', tone: 'b' } : x.priority === 'due' ? { text: 'Due', tone: 'b' } : undefined,
      desc: x.why, actions: [{ label: x.ctaLabel, onClick: () => go(x.route) }],
    });
  });

  // 5 — records that disagree.
  const agreementStep = p.journey.steps.find(s => s.id === 'agreement_signed');
  let agreementState = 'draft';
  try { agreementState = resolveDocumentState(p.projectContext, 'execution_agreement'); } catch { /* treat as unsigned */ }
  // The step ticks as soon as the contract is *sent* (journeyEngine), so compare it with real signatures:
  // the document's own state ('amended' was signed first), or a sign-off recorded directly, as projectRisk reads it.
  const agreementOnFile = ['signed', 'executed', 'amended'].includes(agreementState)
    || ctx.executionSignoff?.status === 'signed' || ctx.contractSignoff?.status === 'signed';
  if (agreementStep?.status === 'done' && !agreementOnFile) {
    rows.push({
      key: 'check-agreement', tone: 'mut', icon: <Glyph name="records" />, title: <>Check the &ldquo;Agreement signed&rdquo; step</>,
      badge: { text: 'Records', tone: 'mut' },
      desc: <>The Ops Matrix ticked it {agreementStep.isAutoDerived ? 'automatically' : ''}{agreementStep.completedAt ? ` on ${shortDate(agreementStep.completedAt.getTime())}` : ''}, but no signed execution agreement is on file.</>,
      actions: [{ label: 'Review', onClick: () => go('project-journey') }],
    });
  }

  // 6 — stage out of step with the Ops Matrix.
  if (p.isMismatch) {
    const to = p.actualPhaseIdx + 1;
    rows.push({
      key: 'realign', tone: 'mut', icon: <Glyph name="realign" />, title: <>Realign the stage to {STAGE_LABELS[to]}</>,
      desc: <>The project is recorded at {STAGE_LABELS[p.stage]}, but its Ops Matrix steps are at {STAGE_LABELS[to]}.</>,
      actions: [{ label: 'Realign', onClick: () => p.advanceLifecycle(to) }],
    });
  }

  // 7 — a finished phase waiting to be moved on.
  const cur = a.strip[a.activeIdx];
  if (!p.isMismatch && cur && cur.total > 0 && cur.done >= cur.total && p.stage < 6) {
    rows.push({
      key: 'phase-done', tone: 'b', icon: <Glyph name="advance" />, title: <>{cur.name} is complete</>,
      desc: <>Every step is signed off. Move the project to {STAGE_LABELS[p.stage + 1]}.</>,
      actions: [{ label: `Move to ${STAGE_LABELS[p.stage + 1]}`, onClick: () => p.advanceLifecycle(p.stage + 1) }],
    });
  }

  // 8 — what the studio promised in meetings.
  if (followUps.total > 0) {
    const first = followUps.items[0];
    rows.push({
      key: 'followups', tone: 'mut', icon: <Glyph name="talk" />,
      title: <>{followUps.total} open follow-up{followUps.total === 1 ? '' : 's'} from meetings</>,
      desc: <>Latest from <b>{first.meeting}</b>{first.meetingMs ? `, ${shortDate(first.meetingMs)}` : ''}.</>,
      list: followUps.items.slice(0, 3).map(i => ({ text: i.text, due: i.due })),
      actions: [{ label: 'Open actions', onClick: () => go('mom-action-tracker') }],
    });
  }

  // 9 — the AI risk alerts the Timeline's predictor wrote.
  (ctx.riskAlerts || []).forEach((r: any, i: number) => {
    const text = String(r.description || r.detail || '');
    rows.push({
      key: `risk-${i}`, tone: 'mut', icon: <Glyph name="alert" />, title: r.title || 'Programme risk',
      badge: r.severity ? { text: String(r.severity), tone: 'gold' } : undefined,
      desc: r.mitigation ? String(r.mitigation).replace(/^Mitigation:\s*/i, '') : undefined,
      why: text || undefined,
      actions: [{ label: 'Timeline', onClick: () => go('timeline') }],
    });
  });

  return rows;
}

/* An engine action's icon, from what it is about rather than how urgent it is. */
function engineGlyph(x: NextAction): GlyphName {
  const s = `${x.title} ${x.route}`.toLowerCase();
  if (/agreement|contract|sign|terms|docket/.test(s)) return 'agreement';
  if (/invoice|payment|advance|collect|fee|money|₹|payment-calc/.test(s)) return 'invoice';
  if (/drawing|gfc|layout|design-gate/.test(s)) return 'plan';
  if (/decision/.test(s)) return 'decision';
  if (/selection|material|sof|finish/.test(s)) return 'swatch';
  if (/visit|site|snag|handover/.test(s)) return 'hardhat';
  if (/meeting|mom|client/.test(s)) return 'talk';
  return 'flag';
}

/* ───────────────────────────── stage advance ───────────────────────────── */

/** The old header's stage buttons, kept exactly: same targets, same stage-5 gate. */
function stageAdvance(stage: number, ctx: any, journey: JourneyContextType):
  { label: string; sub: string; to?: number; tab?: string; disabled?: boolean } | null {
  if (stage === 1) return { label: 'Start Scope & Strategy', sub: 'Move to stage 2', to: 2 };
  if (stage === 2) return { label: 'Approve Scope & Start Proposal', sub: 'Move to stage 3', to: 3 };
  if (stage === 3) return { label: 'Approve Proposal & Start Agreement', sub: 'Move to stage 4', to: 4 };
  if (stage === 4) return { label: 'Sign Contract & Mobilise Execution', sub: 'Move to stage 5', to: 5 };
  if (stage === 5) {
    const gateDone = !!ctx.lifecycle?.gates?.designGateActive?.done;
    const execDone = journey.phaseProgress?.[4]?.done || 0;
    if (!gateDone) return { label: 'Unlock the Design Gate', sub: 'Needed before execution can start', tab: 'design-gate' };
    if (execDone === 0) return { label: 'Initiate project handover', sub: 'Complete execution steps in the Ops Matrix first', disabled: true };
    return { label: 'Initiate project handover', sub: 'Move to stage 6', to: 6 };
  }
  return null;
}

/* ───────────────────────────── rail ───────────────────────────── */

const SECTION_NAME: Record<string, string> = {
  'Payment milestones': 'payments', 'Scope lines': 'scope lines', 'Programme tasks': 'programme tasks',
};

function PortalCard({ portal, go, renew, confirmRenew, copyLink, shareOpen, setShareOpen, shareRef }: {
  portal: ReturnType<typeof portalModel> | null; go: (r: string) => void; renew: () => void; confirmRenew: boolean;
  copyLink: () => void; shareOpen: boolean; setShareOpen: (f: (o: boolean) => boolean) => void; shareRef: React.RefObject<HTMLDivElement>;
}) {
  const soon = portal?.linkExpires ? portal.linkExpires - Date.now() < 7 * 86400000 : false;
  const status = !portal ? { cls: 'none', text: 'Checking…', sub: '' }
    : !portal.sentAt ? { cls: 'none', text: 'Not sent yet', sub: 'The client has no copy of this project.' }
    : portal.behind ? { cls: 'warn', text: 'Their copy is behind', sub: `Last sent ${new Date(portal.sentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` }
    : { cls: 'ok', text: 'Up to date', sub: `Last sent ${new Date(portal.sentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` };
  return (
    <section className="ph-card ph-box ph-tilt ph-rise" style={{ animationDelay: '.06s', position: 'relative', zIndex: 5 }}>
      <h3><span className="ph-hi gold"><Glyph name="portal" /></span>Client portal<span className="sp" /><button className="ph-link" onClick={() => go('client-portal')}>Preview</button></h3>
      <div className="ph-pt-status"><span className={`pulse ${status.cls}`} /><span>{status.text}{status.sub && <small>{status.sub}</small>}</span></div>
      {portal && portal.sees.length > 0 && (
        <div className="ph-pt-sees">
          {portal.sees.map(s => {
            const name = SECTION_NAME[s.section] || s.section.toLowerCase();
            return <span key={s.section}><b>{s.count}</b> {s.count === 1 ? name.replace(/s$/, '') : name}</span>;
          })}
        </div>
      )}
      {portal?.programmeMissing && (
        <div className="ph-pt-line"><span className="ic2">{Icon.bars(13)}</span><span className="t">The <b>programme</b> isn&rsquo;t in their copy yet.</span></div>
      )}
      {portal && (portal.linkExpired || soon || !portal.linkExpires) && (
        <div className={`ph-pt-line${portal.linkExpired || soon ? ' warn' : ''}`}>
          <span className="ic2">{Icon.link(13)}</span>
          <span className="t">{!portal.linkExpires ? <>No client link issued yet.</>
            : portal.linkExpired ? <>Their link <b>expired {shortDate(portal.linkExpires)}</b>.</>
            : <>Their link <b>expires {shortDate(portal.linkExpires)}</b>.</>}</span>
          {portal.linkExpires && <button className="ph-link" style={{ fontSize: 11.5 }} onClick={renew}>{confirmRenew ? 'Confirm renew' : 'Renew'}</button>}
        </div>
      )}
      <div className="ph-pt-actions">
        <div className={`ph-split left${shareOpen ? ' open' : ''}`} ref={shareRef}>
          <button className="ph-btn sm" onClick={() => setShareOpen(o => !o)} aria-haspopup="menu" aria-expanded={shareOpen}>{Icon.plus(13)}Share with client</button>
          <div className="ph-menu" role="menu" style={{ width: 250 }}>
            <button className="ph-mi" role="menuitem" onClick={() => { setShareOpen(() => false); go('client-portal'); }}><span className="ico">{Icon.chat()}</span><span className="t">Post an update<small>From the client portal screen</small></span></button>
            <button className="ph-mi" role="menuitem" onClick={() => { setShareOpen(() => false); go('record-decision'); }}><span className="ico">{Icon.checkBox()}</span><span className="t">Request a decision<small>Options for the client to choose</small></span></button>
            <button className="ph-mi" role="menuitem" onClick={() => { setShareOpen(() => false); go('drawing-tracker'); }}><span className="ico">{Icon.grid()}</span><span className="t">Publish drawings<small>From the Drawing Tracker</small></span></button>
            <button className="ph-mi" role="menuitem" onClick={copyLink}><span className="ico">{Icon.copy()}</span><span className="t">Copy client link</span></button>
          </div>
        </div>
        <button className="ph-btn sm pri" onClick={() => go('client-portal')}>Review &amp; send</button>
      </div>
    </section>
  );
}

function WaitingCard({ decisions, go }: { decisions: any[]; go: (r: string) => void }) {
  const waiting = decisions.filter(d => d.status === 'pending' || d.status === 'proposed');
  const queried = decisions.filter(d => d.status === 'rejected');
  const ui = useUi();
  return (
    <section className="ph-card ph-box ph-tilt ph-rise" style={{ animationDelay: '.12s' }}>
      <h3><span className="ph-hi"><Glyph name="hourglass" /></span>Waiting on the client<span className="sp" /><button className="ph-link" onClick={() => go('record-decision')}>All</button></h3>
      {waiting.length === 0 && queried.length === 0 && <div className="ph-kv" style={{ color: 'var(--ph-mut)' }}>Nothing waiting on the client.</div>}
      {queried.length > 0 && (
        <div className="ph-dec"><span className="t">{queried.length} decision{queried.length === 1 ? '' : 's'} queried<small>The client asked a question — your reply is due</small></span>
          <button className="ph-btn ghost sm" onClick={() => go('record-decision')}>Reply</button></div>
      )}
      {waiting.slice(0, 5).map(d => (
        <div key={d.id} className="ph-dec" {...(d.description ? tipProps(ui, <><b>{d.title}</b>{d.description}</>) : {})}>
          <span className="t">{d.title}<small>{d.description || d.category || 'With the client'}</small></span>
          <button className="ph-btn ghost sm" onClick={() => go('record-decision')}>Follow up</button>
        </div>
      ))}
      {waiting.length > 5 && <div className="ph-kv" style={{ color: 'var(--ph-mut)' }}>+{waiting.length - 5} more in Decisions</div>}
      <div className="pad-b" />
    </section>
  );
}

function ComingUp({ journey, activeIdx, stage, payments }: {
  journey: JourneyContextType; activeIdx: number; stage: number; payments: ReturnType<typeof paymentModel>;
}) {
  const nextIdx = Math.min(PHASES.length - 1, activeIdx + 1);
  const nextSteps = nextIdx > activeIdx ? (journey.stepsByPhase[nextIdx] || []).filter(s => s.status !== 'done') : [];
  const firstExec = payments.rungs.find(r => r.type === 'execution');
  const procurementOpen = !!firstExec && (firstExec.state === 'paid' || firstExec.invoiced);
  const items: { icon: React.ReactNode; title: string; text: string }[] = [];
  if (nextSteps.length) {
    items.push({ icon: <Glyph name="building" />, title: PHASES[nextIdx].name.replace('Pre-Execution', 'Pre-execution'),
      text: nextSteps.slice(0, 3).map(s => s.title).join(', ') + (nextSteps.length > 3 ? '…' : '.') });
  }
  if (stage < 5 && firstExec) items.push({ icon: <Glyph name="lock" />, title: 'Procurement', text: procurementOpen ? 'Open — the first execution payment is raised.' : `Opens once ${firstExec.name} is raised.` });
  if (stage < 6) items.push({ icon: <Glyph name="key" />, title: 'Handover checklist', text: 'Opens at stage 6.' });
  if (!items.length) return null;
  return (
    <section className="ph-card ph-box ph-tilt ph-rise" style={{ animationDelay: '.16s' }}>
      <h3><span className="ph-hi"><Glyph name="calnext" /></span>Coming up</h3>
      {items.map(i => <div key={i.title} className="ph-ahead"><span className="lk">{i.icon}</span><div><b>{i.title}</b><p>{i.text}</p></div></div>)}
      <div className="pad-b" />
    </section>
  );
}

/* Site visit, meeting and decision, one click (or one key) each. */
function RecordCard({ record, flash }: { record: (k: 's' | 'm' | 'd') => void; flash: { k: string; n: number } | null }) {
  const tiles: { k: 's' | 'm' | 'd'; label: string; glyph: GlyphName; cls: string }[] = [
    { k: 's', label: 'Site visit', glyph: 'hardhat', cls: 'site' },
    { k: 'm', label: 'Meeting', glyph: 'people', cls: '' },
    { k: 'd', label: 'Decision', glyph: 'decision', cls: 'dec' },
  ];
  return (
    <section className="ph-card ph-box ph-tilt ph-rise" style={{ animationDelay: '.04s' }}>
      <h3><span className="ph-hi"><Glyph name="pencil" /></span>Record<span className="ph-rec-hint">Shortcut keys S · M · D</span></h3>
      <div className="ph-rec-grid">
        {tiles.map(t => (
          // Re-keying on each press replays the tap animation, also for keyboard presses.
          <button key={flash?.k === t.k ? `${t.k}-${flash.n}` : t.k} className={`ph-rec${flash?.k === t.k ? ' flash' : ''}`}
            onClick={() => record(t.k)} aria-keyshortcuts={t.k.toUpperCase()}>
            <span className={`ri ${t.cls}`}><Glyph name={t.glyph} /></span><b>{t.label}</b><kbd>{t.k.toUpperCase()}</kbd>
          </button>
        ))}
      </div>
    </section>
  );
}

/* The six phases as a stack of isometric slabs: built ones solid, the current one pale with a gold edge, the rest in outline. */
function PhaseStack({ strip }: { strip: ReturnType<typeof journeyStrip> }) {
  const ui = useUi();
  const pts = (a: number[][]) => a.map(p => p.map(n => +n.toFixed(2)).join(',')).join(' ');
  const COL: Record<string, string[]> = {
    done: ['#6D80CB', '#3D52A0', '#2E3F82'],
    now: ['url(#ph-slab-now)', '#A9B9EE', '#8A9FE0'],
    todo: ['rgba(255,255,255,.45)', 'rgba(236,240,250,.55)', 'rgba(222,228,244,.6)'],
  };
  const EDGE: Record<string, string> = { done: 'rgba(255,255,255,.22)', now: '#B5945B', todo: 'rgba(61,82,160,.3)' };
  const slab = (y: number, st: string) => {
    const x = 64, w = 46, d = w / 2, h = 9, top = y - h;
    const stroke = { stroke: EDGE[st], strokeWidth: st === 'done' ? 0.6 : 0.8, strokeLinejoin: 'round' as const };
    return (
      <>
        <polygon points={pts([[x - w, top], [x, top + d], [x, y + d], [x - w, y]])} fill={COL[st][1]} {...stroke} />
        <polygon points={pts([[x, top + d], [x + w, top], [x + w, y], [x, y + d]])} fill={COL[st][2]} {...stroke} />
        <polygon points={pts([[x, top - d], [x + w, top], [x, top + d], [x - w, top]])} fill={COL[st][0]} {...stroke} />
      </>
    );
  };
  const current = strip.find(s => s.state === 'now');
  const tip = <><b>{current ? `Now: ${current.name}` : 'Project phases'}</b>{strip.map(s => <small key={s.index}>{s.state === 'done' ? '✓' : s.state === 'now' ? '●' : '○'} {s.name} {s.done}/{s.total}</small>)}</>;
  return (
    <div className="ph-stack" {...tipProps(ui, tip)} aria-label={current ? `Current phase: ${current.name}` : 'Project phases'} role="img">
      <svg viewBox="0 0 128 150" aria-hidden="true">
        <defs>
          <linearGradient id="ph-slab-now" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F3F6FE" /><stop offset="1" stopColor="#C3D0F6" /></linearGradient>
          <radialGradient id="ph-stack-shadow"><stop offset="0" stopColor="rgba(39,52,110,.28)" /><stop offset="1" stopColor="rgba(39,52,110,0)" /></radialGradient>
        </defs>
        <ellipse cx="64" cy="140" rx="54" ry="9" fill="url(#ph-stack-shadow)" />
        {strip.slice(0, 6).map((s, i) => (
          <g key={s.index} className="drop" style={{ ['--i' as any]: i }}>
            <g className="spread" style={{ ['--i' as any]: i }}>
              <g className={s.state === 'now' ? 'now' : ''}>{slab(122 - i * 17, s.state)}</g>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
