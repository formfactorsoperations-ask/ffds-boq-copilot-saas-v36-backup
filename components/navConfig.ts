import { isTerminated, settlementLine } from '../lib/termination';
import { Compass, FolderOpen, MessageSquare, Wallet, Scale, Clock, Calendar, MonitorSmartphone, BarChart3, FileCheck } from '@/lib/lucide-shim';
import { ProjectContext } from '../types';
import { STAGE_LABELS } from '../constants/journeyConstants';
import { calculateClientActionItems } from '../services/clientPortalEngine';
import { resolveApprovals } from '../services/clientApprovalEngine';
import { unansweredMessages } from './ops/ClientMessagesPage';

/**
 * What the client currently owes, for the Project Hub badge.
 *
 * The portal engine already decides which items belong to the client and which
 * sit with the studio, so the badge asks it rather than re-deriving the rule.
 * Cached against the context object because the band recomputes every render
 * and this walks the whole lifecycle.
 */
interface PortalPulse {
  /** Items sitting with the client right now. */
  pending: number;
  /** False until the studio has actually sent the client something. */
  started: boolean;
}

const portalPulseCache = new WeakMap<object, PortalPulse | null>();
const portalPulse = (ctx: ProjectContext): PortalPulse | null => {
  if (!ctx || typeof ctx !== 'object') return null;
  const hit = portalPulseCache.get(ctx);
  if (hit !== undefined) return hit;
  let pulse: PortalPulse | null = null;
  try {
    // projectData is unused by the calculation — the signature keeps it for
    // callers that already hold one.
    const { clientActions } = calculateClientActionItems(ctx, {} as any);
    const approvals = resolveApprovals(ctx, 1);
    pulse = {
      pending: clientActions.length,
      // resolveApprovals also returns the `all` / `actionable` / `breaches`
      // arrays, so only the three agreements are inspected here.
      started: ([approvals.terms, approvals.contract, approvals.handover])
        .some(a => a && a.state !== 'not_started')
    };
  } catch {
    pulse = null;
  }
  portalPulseCache.set(ctx, pulse);
  return pulse;
};

export interface NavItem {
  label: string;
  route: string;
  money?: boolean;
  icon?: any;
  statusBadge?: (project: ProjectContext) => string | null;
  badgeTone?: (project: ProjectContext) => 'ok' | 'alert' | 'warn' | 'neutral' | null;
}

export interface NavStage {
  stage: number;
  label: string;
  items: NavItem[];
}

/**
 * The workflow rail: six stages, each owning the screens that belong to it.
 *
 * Stage names come from STAGE_LABELS rather than being written out here, so this
 * rail and the stage stepper in the project bar always read the same. They had
 * drifted: stage 5 was "Execution & Site" here and "Execution" in the stepper,
 * both visible at once. Rename a stage in STAGE_LABELS and both follow.
 */
export const NAV_CONFIG: NavStage[] = [
  {
    stage: 1,
    label: STAGE_LABELS[1],
    items: [
      /* The Terms Docket moved to stage 3. It is the design agreement, and
         FFDS quotes before it signs: leaving it here made the whole
         commercial phase wait on a signature that normally follows the
         proposal. Stage 1 is discovery, and discovery alone. */
      { label: "Brief & Site", route: "leadiq" }
    ]
  },
  {
    stage: 2,
    label: STAGE_LABELS[2],
    items: [
      /* Tiers first, because a BOQ belongs to a tier: its lines live at
         projects/{id}/tierBoq/{tierId}, the editor bails with "Please select a
         proposal tier" when none is active, and creating one here already
         hands off to the editor. The rail used to list the dead end first. */
      { label: "Pricing & Tiers", route: "ops", money: true },
      { label: "BOQ Editor", route: "boq-editor" },
      /* Was Health Check & Audit (retired: nothing on it was actionable). The id
         stays "analytics" so saved tabs, role lists and links keep working. */
      { label: "Money & Offers", route: "analytics", money: true }
    ]
  },
  {
    stage: 3,
    label: STAGE_LABELS[3],
    items: [
      { label: "Client Proposal", route: "client" },
      { label: "Versions & Revision Studio", route: "revision-studio" },
      /* Onboarding belongs to the yes, not to the paperwork that follows it.
         It sat in stage 4 behind a contract-and-design-agreement lock, which
         put the welcome pack after the two documents it is meant to prepare
         the client for. It now opens as soon as the proposal is accepted. */
      { 
        label: "Terms Docket", 
        route: "terms-docket",
        statusBadge: (ctx) => {
          if (ctx.designAgreementSignoff?.status === 'signed') return "Signed ✓";
          if (ctx.designAgreementSignoff?.status === 'sent') return "Sent ✉";
          return null;
        }
      },
      { label: "Onboarding Kit", route: "onboarding" }
    ]
  },
  {
    stage: 4,
    label: STAGE_LABELS[4],
    items: [
      { 
        label: "Execution Agreement", 
        route: "execution-agreement",
        statusBadge: (ctx) => {
          if (ctx.executionSignoff?.status === 'signed') return "Signed ✓";
          if (ctx.executionSignoff?.status === 'sent') return "Sent ✉";
          return null;
        }
      },
      /* Payment Schedule lives in the Project Hub as Money: money runs across
         every stage, and listing the one screen in two places made the sidebar
         close this stage and lose its highlight when it was opened from here. */
      { 
        label: "Design Gate", 
        route: "design-gate",
        statusBadge: (ctx) => {
           if ((ctx as any)?.designGateChecklist) {
              const items = Object.values((ctx as any).designGateChecklist);
              const checked = items.filter((v: any) => v).length;
              return `${checked}/${items.length}`;
           }
           return null;
        }
      }
    ]
  },
  {
    stage: 5,
    label: STAGE_LABELS[5],
    items: [
      /*
        Execution & Ops was one screen with five tabs, sub-tabs and switches
        under those: five levels from the stage to the electrical plan. Each
        part is now its own screen here, and a screen stacks its tools as
        summary-first sections (components/site/SectionStack, plan item 9).
        3D renders moved to the hub's Drawings; Procurement joined the
        purchase orders under Selections & orders.
      */
      { label: "Site Control Room", route: "site-ops" },
      { label: "Quality & Snags", route: "site-quality" },
      { label: "Meetings & Reports", route: "site-meetings" },
      { label: "Selections & Orders", route: "materials" },
      { label: "Scope Additions", route: "scope-additions" }
    ]
  },
  {
    stage: 6,
    label: STAGE_LABELS[6],
    items: [
      { label: "Handover Docket", route: "handover-docket" }
    ]
  }
];

export const ALWAYS_ON_BAND: NavItem[] = [
  { 
    label: "Ops Matrix", 
    route: "project-journey",
    icon: Compass,
    statusBadge: (ctx) => {
      const summary = (ctx as any)?.journeySummary;
      if (summary) {
        return `${summary.pct}%`;
      }
      return null;
    },
    badgeTone: (ctx) => {
      const summary = (ctx as any)?.journeySummary;
      return summary?.pct === 100 ? 'ok' : 'neutral';
    }
  },
  {
    /* Drawings are worked on from the first sketch to handover, so the
       tracker sits in the hub rather than under one stage. */
    label: "Drawings",
    route: "drawing-tracker",
    icon: FileCheck,
    statusBadge: (ctx) => {
      const tracker = (ctx as any)?.drawingTracker;
      if (!tracker) return null;
      const drawings = Object.values(tracker);
      if (!drawings.length) return null;
      const approved = drawings.filter((d: any) => d.status === 'Approved').length;
      return `${approved}/${drawings.length}`;
    },
    badgeTone: (ctx) => {
      const drawings = Object.values((ctx as any)?.drawingTracker || {});
      return drawings.length && drawings.every((d: any) => d.status === 'Approved') ? 'ok' : 'neutral';
    }
  },
  {
    /* Sits beside Ops Matrix because both answer "how is this project doing",
       one in steps and one in money. */
    /* "Project Health" (owner, 27 Nov 2026: "Reports" did not say what it is). */
    label: "Project Health",
    route: "project-reports",
    icon: BarChart3,
    money: true,
    statusBadge: (ctx) => {
      const pct = (ctx as any)?.journeySummary?.pct;
      return typeof pct === 'number' ? `${pct}%` : null;
    },
    badgeTone: () => 'neutral',
  },
  { 
    label: "Documents", 
    route: "docs",
    icon: FolderOpen
  },
  {
    // The portal matters from the first docket onwards, not just at execution,
    // so it belongs on the always-on band rather than behind a stage lock.
    label: "Client Portal",
    route: "client-portal",
    icon: MonitorSmartphone,
    statusBadge: (ctx) => {
      const pulse = portalPulse(ctx);
      if (!pulse) return null;
      if (pulse.pending > 0) return `${pulse.pending} due`;
      // No tick before anything has been sent — an untouched portal is not
      // a finished one.
      return pulse.started ? "✓" : null;
    },
    badgeTone: (ctx) => {
      const pulse = portalPulse(ctx);
      if (!pulse) return null;
      if (pulse.pending > 0) return 'alert';
      return pulse.started ? 'ok' : null;
    }
  },
  { 
    label: "Timeline", 
    route: "timeline",
    icon: Calendar
  },
  {
    /* What the client has written from their portal. Replaced Client Comms (its
       generic email templates were retired); the route keeps its old id so
       notifications and saved links still land here. */
    label: "Messages",
    route: "comms-tracker",
    icon: MessageSquare,
    statusBadge: (ctx) => {
      const open = unansweredMessages(ctx);
      return open > 0 ? `${open} new` : null;
    },
    badgeTone: (ctx) => (unansweredMessages(ctx) > 0 ? 'alert' : null)
  },
  { 
    label: "Money", 
    route: "payment-calc", 
    money: true,
    icon: Wallet,
    statusBadge: (ctx) => {
      /* Terminated (lib/termination): no milestone is open; what counts is whether the settlement is. */
      if (isTerminated(ctx)) return settlementLine((ctx as any).termination?.settlement).kind !== 'even' && (ctx as any).termination?.settlement?.status === 'open' ? 'Settle' : 'Closed';
      const milestones = ctx?.paymentMilestones;
      if (!milestones || milestones.length === 0) return null;
      const open = milestones.filter(m => m.status !== 'paid').length;
      return open > 0 ? `${open} open` : "✓";
    },
    badgeTone: (ctx) => {
      if (isTerminated(ctx)) return 'neutral';
      const milestones = ctx?.paymentMilestones;
      if (!milestones || milestones.length === 0) return 'neutral';
      const open = milestones.filter(m => m.status !== 'paid').length;
      return open > 0 ? 'warn' : 'ok';
    }
  },
  { 
    label: "Decisions", 
    route: "record-decision",
    icon: Scale,
    /*
      Reads the same projection the client portal does, so the badge and the
      portal can never disagree about how many decisions are outstanding.
      A query the client raised outranks a decision merely waiting on them --
      one is stuck, the other is simply in flight.
    */
    statusBadge: (ctx) => {
      const decisions = ctx?.projectDecisions || [];
      const queried = decisions.filter((d: any) => d.status === 'rejected').length;
      const waiting = decisions.filter((d: any) => d.status === 'pending' || d.status === 'proposed').length;
      if (queried > 0) return `${queried} queried`;
      if (waiting > 0) return `${waiting} due`;
      return decisions.length > 0 ? "✓" : null;
    },
    badgeTone: (ctx) => {
      const decisions = ctx?.projectDecisions || [];
      if (decisions.some((d: any) => d.status === 'rejected')) return 'alert';
      if (decisions.some((d: any) => d.status === 'pending' || d.status === 'proposed')) return 'warn';
      return decisions.length > 0 ? 'ok' : null;
    }
  },
  {
    label: "History",
    route: "history",
    icon: Clock,
    statusBadge: (ctx) => {
      const count = ctx?.history?.length || 0;
      return count > 0 ? String(count) : null;
    },
    badgeTone: (ctx) => {
      return 'neutral';
    }
  }
];

/**
 * The screen after this one in the workflow, for the "Next" button at the end
 * of a stage's screens.
 *
 * The rail is already in working order -- Brief & Site, then Pricing & Tiers,
 * BOQ Editor, Money & Offers, then the proposal, the agreements and site -- but
 * nothing on screen said so: after creating a project, the only way to learn
 * what came next was to hover the menu. This walks the same order, across
 * stages, skipping what this person cannot open (hidden for their role or the
 * engagement), and stops at a stage that is still locked.
 */
export function nextScreen(
  nav: NavStage[],
  activeRoute: string,
  opts: { isHidden?: (item: NavItem) => boolean; isStageLocked?: (stage: number) => boolean } = {},
): { route: string; label: string; stage: number } | null {
  const flat = nav.flatMap((s) => s.items.map((item) => ({ item, stage: s.stage })));
  const at = flat.findIndex((x) => x.item.route === activeRoute);
  if (at < 0) return null;
  for (const { item, stage } of flat.slice(at + 1)) {
    if (opts.isHidden?.(item)) continue;
    if (item.route === activeRoute) continue; // a route listed twice (Money) is not "next"
    if (opts.isStageLocked?.(stage)) return null;
    return { route: item.route, label: item.label, stage };
  }
  return null;
}

/**
 * Where a new project opens once the setup wizard has done its job: the
 * options it just generated (Pricing & Tiers), or, for a manual start, the BOQ
 * it is about to be built in. It used to stay on the Project Hub, which said
 * nothing about either. Falls back along the rail when the engagement has no
 * such screen (a design-only project has no pricing or BOQ: its proposal).
 */
export function landingAfterSetup(isHidden: (route: string) => boolean, kind: 'options' | 'manual'): string {
  const order = kind === 'options' ? ['ops', 'boq-editor', 'client'] : ['boq-editor', 'ops', 'client'];
  return order.find((r) => !isHidden(r)) || 'client';
}
