import { Compass, FolderOpen, MessageSquare, Wallet, Scale, Clock, Calendar, MonitorSmartphone } from 'lucide-react';
import { ProjectContext } from '../types';
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

export const NAV_CONFIG: NavStage[] = [
  {
    stage: 1,
    label: "Initial Consultation",
    items: [
      { label: "Brief & Site", route: "leadiq" },
      { 
        label: "Terms Docket", 
        route: "terms-docket",
        statusBadge: (ctx) => {
          if (ctx.designAgreementSignoff?.status === 'signed') return "Signed ✓";
          if (ctx.designAgreementSignoff?.status === 'sent') return "Sent ✉";
          return null;
        }
      }
    ]
  },
  {
    stage: 2,
    label: "Scope & Strategy",
    items: [
      { label: "BOQ Editor", route: "boq-editor" },
      { label: "Pricing & Tiers", route: "ops", money: true },
      { label: "Health Check & Audit", route: "analytics", money: true }
    ]
  },
  {
    stage: 3,
    label: "Proposal & Revisions",
    items: [
      { label: "Client Proposal", route: "client" },
      { label: "Versions & Revision Studio", route: "revision-studio" }
    ]
  },
  {
    stage: 4,
    label: "Agreement & Design",
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
      { label: "Onboarding Kit", route: "onboarding" },
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
    label: "Execution & Site",
    items: [
      { label: "Execution & Ops", route: "site-ops" },
      { label: "SOF & Selections", route: "materials" },
      { label: "Scope Additions", route: "scope-additions" }
    ]
  },
  {
    stage: 6,
    label: "Handover & Closeout",
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
    icon: Scale
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
