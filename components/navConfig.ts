import { Compass, FolderOpen, MessageSquare, Wallet, Scale, Clock, Calendar, MonitorSmartphone, BarChart3 } from 'lucide-react';
import { ProjectContext } from '../types';
import { STAGE_LABELS } from '../constants/journeyConstants';
import { calculateClientActionItems } from '../services/clientPortalEngine';
import { resolveApprovals } from '../services/clientApprovalEngine';

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
      { label: "Health Check & Audit", route: "analytics", money: true }
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
      { label: "Payment Schedule", route: "payment-calc", money: true },
      { 
        label: "Drawing Tracker", 
        route: "drawing-tracker",
        statusBadge: (ctx) => {
          if ((ctx as any)?.drawingTracker) {
             const drawings = Object.values((ctx as any).drawingTracker);
             const approved = drawings.filter((d: any) => d.status === 'Approved').length;
             return `${approved}/${drawings.length}`;
          }
          return null;
        }
      },
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
      { label: "Execution & Ops", route: "site-ops" },
      { label: "SOF & Selections", route: "materials" },
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
    /* Sits beside Ops Matrix because both answer "how is this project doing",
       one in steps and one in money. */
    label: "Reports",
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
    label: "Client Comms", 
    route: "comms-tracker",
    icon: MessageSquare,
    statusBadge: (ctx) => {
      const pending = (ctx as any)?.commsSummary?.pendingCount || (ctx as any)?.commsPendingCount || 0;
      const health = (ctx as any)?.commsSummary?.healthScore || (ctx as any)?.commsHealth || 0;
      if (pending > 0) {
        return `${pending} due`;
      }
      if (health === 100) {
        return "✓";
      }
      return null;
    },
    badgeTone: (ctx) => {
      const pending = (ctx as any)?.commsSummary?.pendingCount || (ctx as any)?.commsPendingCount || 0;
      const health = (ctx as any)?.commsSummary?.healthScore || (ctx as any)?.commsHealth || 0;
      if (pending > 0) return 'alert';
      if (health === 100) return 'ok';
      return 'neutral';
    }
  },
  { 
    label: "Money", 
    route: "payment-calc", 
    money: true,
    icon: Wallet,
    statusBadge: (ctx) => {
      const milestones = ctx?.paymentMilestones;
      if (!milestones || milestones.length === 0) return null;
      const open = milestones.filter(m => m.status !== 'paid').length;
      return open > 0 ? `${open} open` : "✓";
    },
    badgeTone: (ctx) => {
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
