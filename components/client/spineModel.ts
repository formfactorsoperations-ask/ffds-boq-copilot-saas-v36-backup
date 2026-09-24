import { ProjectContext, PaymentMilestone, ProjectDecisionRecord, ClientDocumentKind } from '../../types';
import { ClientLifecycleSummary, ClientActionItem, decisionNature } from '../../services/clientPortalEngine';
import { getCurrentIssue, resolveDocumentState } from '../../services/documentIssueEngine';
import { isVisibleToClient } from '../../lib/clientVisibility';
import { formatINR } from '../../lib/utils';
import { Programme, stageAtDate } from './programme';

/**
 * The spine's data: every real thing on the project, hung off the stage it
 * belongs to.
 *
 * The portal used to show each kind of thing on its own screen — documents on
 * one, payments on another, decisions on a third — which left the client to
 * work out for themselves that the drawing, the decision and the invoice were
 * all one moment in the project. The spine puts them back together, so a stage
 * reads as "here is what happened, here is what it cost, here is what it needs
 * from you".
 *
 * Nothing here is invented. An item appears against a stage only where the
 * lifecycle actually places it (see STAGE_OF_DOCUMENT), or where it carries a
 * date or trigger that says so. Anything the project has not decided about goes
 * against the current stage, which is where it is genuinely live — never spread
 * across earlier stages to make the page look fuller.
 */

export type AttachmentKind = 'decisions' | 'doc' | 'photo' | 'payments' | 'design' | 'material';

export interface SpineAttachment {
  id: string;
  kind: AttachmentKind;
  title: string;
  /** The one line under the title: date, amount, state. Always from the record. */
  subtitle: string;
  /** Set when this is the client's to act on — renders hot, with the action. */
  needsClient?: boolean;
  action?: { label: string; run: () => void };
  secondaryAction?: { label: string; run: () => void };
  /** Shown instead of a button when the thing is already done. */
  doneNote?: string;
}

export interface SpinePhase {
  stageNumber: number;
  name: string;
  /** "Aug 2026" where a real date exists, otherwise null — never a guess. */
  when: string | null;
  whenNote: string | null;
  status: 'completed' | 'active' | 'pending';
  /** "stage 3 of 6", "starts when stage 2 clears" — the right-hand note. */
  eventNote: string;
  /** The consequence line at the top of an open phase. */
  impact: { tone: 'warn' | 'calm'; text: string } | null;
  /** True when the month is interpolated rather than taken from the schedule. */
  whenIsEstimate: boolean;
  /** Dated points inside the stage, rendered as a sub-spine. */
  milestones: { id: string; label: string; date: string; done: boolean }[];
  attachments: SpineAttachment[];
}

/**
 * Where each client document sits in the lifecycle. This is the lifecycle's own
 * definition, not a guess: the terms docket and payment schedule are what make
 * stage 2 real, the execution agreement is the stage 4 gate, and the handover
 * docket closes stage 6.
 */
/**
 * The three documents a client is ever asked to sign, and the action the engine
 * raises for each. `payment_schedule` and `onboarding_kit` are issued to the
 * client but never signed by them — marking those "signature pending" was
 * adding a phantom task, which is why the hero counted 2 items and the spine
 * counted 3.
 */
const SIGNABLE_BY_CLIENT: Partial<Record<ClientDocumentKind, string>> = {
  terms_docket: 'sign_terms',
  execution_agreement: 'sign_contract',
  handover_docket: 'sign_handover',
};

const STAGE_OF_DOCUMENT: Record<ClientDocumentKind, number> = {
  terms_docket: 2,
  payment_schedule: 2,
  onboarding_kit: 3,
  execution_agreement: 4,
  handover_docket: 6,
} as Record<ClientDocumentKind, number>;

const DOCUMENT_LABEL: Record<string, string> = {
  terms_docket: 'Terms of engagement',
  payment_schedule: 'Payment schedule',
  onboarding_kit: 'Onboarding kit',
  execution_agreement: 'Execution agreement',
  handover_docket: 'Handover docket & warranties',
};

const fmtDate = (v?: string | number | null): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtMonth = (v?: string | number | null): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

/**
 * Which lifecycle stage a payment milestone belongs to.
 *
 * This used to regex the milestone's name and trigger, in this order:
 *
 *     /signup|booking|advance|token/  -> stage 1
 *     /handover|possession|final/     -> stage 6
 *     /site start|mobilis|execution/  -> stage 5
 *     ...
 *
 * "Advance" appears in almost every Indian construction milestone name, so
 * "Material Order Advance", "Finishing Advance" and "Structure Advance" all
 * matched the FIRST rule and were filed under stage 1 — four unrelated payments
 * spread across a six-month build collapsed onto one date in August. The
 * heuristic was guessing at data that was never in doubt.
 *
 * `type` is authoritative and is what the studio's own Money tab groups by:
 * design fees run through the design stages, execution milestones through the
 * build. Only the closing milestones need the name, because "handover" is a
 * stage in this lifecycle rather than a kind of payment.
 */
export function stageOfMilestone(
  m: PaymentMilestone,
  index: number,
  currentStage: number,
  designCount = 0,
  executionCount = 0,
): number {
  const t = `${m.trigger || ''} ${m.name || ''}`.toLowerCase();
  const isClosing = /handover|possession|snag|retainer|final payment/.test(t);

  if (m.type === 'design') {
    /*
      The studio's actual fee schedule, not an even spread:

        1st — sign-up. Taken at the start of the project.
        2nd — design development. Due when 3D & selections begin (stage 3).
        3rd — design completion. Due when the design is frozen (stage 4).

      Spreading them evenly across stages 1–4 put the second fee in stage 2,
      which is a month before the work it pays for starts.
    */
    const DESIGN_FEE_STAGES = [1, 3, 4];
    return DESIGN_FEE_STAGES[Math.min(index, DESIGN_FEE_STAGES.length - 1)];
  }

  if (m.type === 'execution') return isClosing ? 6 : 5;

  // No type recorded: fall back to the name, then to where the project is.
  if (isClosing) return 6;
  if (/site start|mobilis|execution|works|carpentry|first-fix|finishing/.test(t)) return 5;
  if (/design sign|design fee|freeze|contract|agreement/.test(t)) return 4;
  if (/signup|booking|token/.test(t)) return 1;
  return currentStage;
}

/**
 * How long after handover the retention is released.
 *
 * The agreement is the authority here and this is the common contractual
 * window; when a project records its own retention period this should read it
 * rather than assume. Flagged as indicative in the portal either way.
 */
export const RETENTION_DAYS_AFTER_HANDOVER = 21;

/**
 * Where inside its stage a milestone falls.
 *
 * `share` is 0 at the stage's start and 1 at its end; -1 means "spread this one
 * by its position among the stage's other milestones", which is what execution
 * milestones want — money released as the build progresses.
 */
export function milestonePlacement(m: PaymentMilestone): { share: number; offsetDays: number } {
  const t = `${m.trigger || ''} ${m.name || ''}`.toLowerCase();

  // Retention is not due at handover — it is due after it, once the snag
  // period has run.
  if (/retainer|retention/.test(t)) {
    return { share: 1, offsetDays: RETENTION_DAYS_AFTER_HANDOVER };
  }

  // Design fees fall due at the start of the stage whose work they release.
  if (m.type === 'design') return { share: 0, offsetDays: 0 };

  return { share: -1, offsetDays: 0 };
}

interface BuildArgs {
  context: ProjectContext;
  lifecycle: ClientLifecycleSummary;
  /** Dated stage windows from the project's own schedule. */
  programme: Programme;
  milestones: PaymentMilestone[];
  decisions: ProjectDecisionRecord[];
  milestoneAmount: (m: PaymentMilestone) => number;
  clientActions: ClientActionItem[];
  onRunAction: (item: ClientActionItem) => void;
  /** Opens the decision so it can be read before it is answered. */
  onOpenDecision: (id: string) => void;
  onOpenDocument: (kind: ClientDocumentKind) => void;
}

export function buildSpine({
  context, lifecycle, programme, milestones, decisions, milestoneAmount,
  clientActions, onRunAction, onOpenDecision, onOpenDocument,
}: BuildArgs): SpinePhase[] {
  const current = lifecycle.currentStageNumber;
  const byStage = new Map<number, SpineAttachment[]>();
  const push = (stage: number, a: SpineAttachment) => {
    const s = Math.min(6, Math.max(1, stage));
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s)!.push(a);
  };

  /* ── Decisions ─────────────────────────────────────────────────────────
     Filed against the stage that was running when the decision was raised —
     not against whatever stage is current. A decision raised on 27 July sat
     under "Scope & Design Strategy · September" because everything undated
     defaulted to the current stage, which made the portal look like it had
     invented the date. Only a decision with no date at all falls back. */
  decisions.forEach(d => {
    const pending = d.status === 'pending' || d.status === 'proposed';
    const settled = d.status === 'confirmed';
    const raised = fmtDate(d.date);
    // A settled decision files against the stage it was settled in. An OPEN
    // one files against the current stage, wherever it was raised — otherwise
    // a completed stage carries a "2 need you" tag, which cannot be true of a
    // stage that is finished.
    const at = pending ? current : (stageAtDate(programme, d.clientConfirmedAt || d.date) ?? current);
    push(at, {
      id: `dec-${d.id}`,
      kind: 'decisions',
      title: d.title,
      subtitle: settled
        ? `Approved${d.clientConfirmedAt ? ` ${fmtDate(d.clientConfirmedAt)}` : ''}${d.confirmingParty ? ` by ${d.confirmingParty}` : ''}`
        : pending
          ? `${decisionNature(d as any, current) === 'site' ? 'Site decision' : 'Design decision'}${d.roomId ? ` · ${d.roomId}` : ''} · awaiting your choice${raised ? ` · raised ${raised}` : ''}`
          : `${d.status}${raised ? ` · ${raised}` : ''}`,
      needsClient: pending,
      // Was a bare Approve on a one-line summary. Approving something you have
      // not been shown is not consent, so this opens it instead.
      action: pending ? { label: 'Review and decide', run: () => onOpenDecision(d.id) } : undefined,
      doneNote: settled ? '✓ Approved' : undefined,
    });
  });

  /* ── Documents ─────────────────────────────────────────────────────── */
  (Object.keys(STAGE_OF_DOCUMENT) as ClientDocumentKind[]).forEach(kind => {
    const state = resolveDocumentState(context, kind, { clientView: true });
    const issue = getCurrentIssue(context, kind, { clientView: true });
    if (state === 'draft' && !issue) return;   // not issued: nothing to show a client
    const issued = fmtDate((issue as any)?.issuedAt || (issue as any)?.date);
    const signed = state === 'signed' || state === 'executed';
    // A reissue is the case a client most needs told about: they signed
    // something, and what is now live is not what they signed.
    const amended = state === 'amended';
    const version = (issue as any)?.version;
    const versionTag = version && version > 1 ? `v${version}` : null;

    // "Needs you" only when the engine is actually asking for a signature.
    const actionType = SIGNABLE_BY_CLIENT[kind];
    const liveAction = actionType
      ? clientActions.find(a => a.actionType === actionType)
      : undefined;
    const needsClient = (!signed || amended) && (!!liveAction || amended);

    push(STAGE_OF_DOCUMENT[kind], {
      id: `doc-${kind}`,
      kind: 'doc',
      title: DOCUMENT_LABEL[kind] || kind,
      // The version leads when there is more than one, because "v2 issued —
      // your signature is on v1" is the whole story for a reissued document.
      subtitle: [
        versionTag,
        amended
          ? `reissued${issued ? ` ${issued}` : ''} — your signature was on the previous version`
          : signed
            ? `Signed${issued ? ` · issued ${issued}` : ''}`
            : needsClient
              ? `${issued ? `Issued ${issued} · ` : ''}needs your signature`
              : `${issued ? `Issued ${issued}` : 'Issued to you'}`,
      ].filter(Boolean).join(' · '),
      needsClient,
      action: {
        label: amended ? 'Read & re-sign' : needsClient ? 'Read & sign' : 'Open',
        // A reissue always opens the document itself: the client has to read
        // what changed before signing it again.
        run: () => (needsClient && liveAction && !amended ? onRunAction(liveAction) : onOpenDocument(kind)),
      },
    });
  });

  /* ── Payments ──────────────────────────────────────────────────────── */
  const designMs = milestones.filter(m => m.type === 'design');
  const execMs = milestones.filter(m => m.type === 'execution');

  milestones.forEach((m, i) => {
    const groupIndex = m.type === 'design' ? designMs.indexOf(m) : execMs.indexOf(m);
    const paid = m.status === 'paid';
    const raised = m.status === 'invoiced';
    const when = fmtDate(m.invoiceDate || m.date);
    /*
      Same rule: an invoice awaiting payment belongs to now, not to the stage
      whose trigger raised it.

      And the same distinction the timeline draws -- a date places a payment
      only once it has been billed. An unbilled milestone's date is the plan ops
      entered, so filing by it kept payments against stages the programme had
      since moved away from; those are filed by their trigger instead.
    */
    const datePlaced = (paid || !!m.invoiceDate)
      ? stageAtDate(programme, m.invoiceDate || m.date)
      : null;
    push(raised ? current : (datePlaced ?? stageOfMilestone(m, groupIndex, current, designMs.length, execMs.length)), {
      id: `pay-${m.id}`,
      kind: 'payments',
      title: m.name,
      subtitle: `${formatINR(milestoneAmount(m))} · ${
        paid ? `cleared${when ? ` ${when}` : ''}`
             : raised ? `invoiced${when ? ` ${when}` : ''} — due`
             : m.trigger || 'not yet due'
      }`,
      needsClient: raised,
      doneNote: paid ? '✓ Paid' : undefined,
    });
  });

  /* ── Site updates, drawings and finishes ───────────────────────────────
     Published-only: a draft the studio has not released is not the client's
     to see, and isVisibleToClient is the single gate on that. */
  const visible = <T,>(list: T[] | undefined) => (list || []).filter(isVisibleToClient as any);

  visible<any>((context as any).siteUpdates).forEach((u: any, i: number) => {
    const when = fmtDate(u.date || u.createdAt);
    push(stageAtDate(programme, u.date || u.createdAt) ?? 5, {
      id: `site-${u.id || i}`,
      kind: 'photo',
      title: u.title || u.note || 'Site update',
      subtitle: [when, u.photos?.length ? `${u.photos.length} photos` : null].filter(Boolean).join(' · ') || 'Posted from site',
    });
  });

  visible<any>(context.designDocuments).forEach((d: any, i: number) => {
    push(stageAtDate(programme, d.addedAt) ?? 3, {
      id: `design-${d.id || i}`,
      kind: 'design',
      title: d.title || d.name || 'Drawing',
      subtitle: [d.roomName, fmtDate(d.addedAt)].filter(Boolean).join(' · ') || 'Issued to you',
    });
  });

  visible<any>(context.materialSelections).forEach((m: any, i: number) => {
    const confirmed = !!m.clientConfirmedAt;
    push(3, {
      id: `mat-${m.id || i}`,
      kind: 'material',
      title: m.itemName || 'Finish selection',
      subtitle: [m.category, m.brand || m.vendor, confirmed ? `confirmed ${fmtDate(m.clientConfirmedAt)}` : m.status]
        .filter(Boolean).join(' · '),
      doneNote: confirmed ? '✓ Confirmed' : undefined,
    });
  });

  /* ── Phases ────────────────────────────────────────────────────────── */
  return lifecycle.stages.map(s => {
    const mine = byStage.get(s.stageNumber) || [];
    // Client-owned items first, then everything else in the order added.
    mine.sort((a, b) => Number(!!b.needsClient) - Number(!!a.needsClient));
    const needs = mine.filter(a => a.needsClient).length;

    // The impact line. On the current stage it is the consequence the engine
    // already computed for the top client action — the same sentence the
    // overview shows, not a second opinion about the same thing.
    const liveAction = s.stageNumber === current
      ? clientActions.find(a => a.consequence) || clientActions[0]
      : undefined;

    const impact: SpinePhase['impact'] =
      s.status === 'active' && liveAction
        ? { tone: 'warn', text: liveAction.consequence || `${liveAction.title} — ${liveAction.subtitle}` }
        : s.status === 'active'
          ? { tone: 'calm', text: s.gateNote || s.description || 'Work is with the studio. Nothing needs you here right now.' }
          : s.status === 'pending'
            ? { tone: 'calm', text: s.clientDeliverable || s.description || 'Nothing for you here yet.' }
            : null;

    return {
      stageNumber: s.stageNumber,
      name: s.title || s.name,
      // The month comes from the computed schedule, so the left column reads
      // as a calendar running down the page. Where the studio has published no
      // schedule it stays empty rather than showing an invented month.
      // The month, never the day. Two stages inside one month both reading
      // "Aug 2026" is correct — the day-level detail belongs to the milestones
      // inside the stage, where a date means something specific.
      when: programme.stages.find(p => p.stageNumber === s.stageNumber)?.month
            || fmtMonth(s.completedAt),
      whenIsEstimate: !(programme.stages.find(p => p.stageNumber === s.stageNumber)?.hasSchedule ?? true),
      whenNote: s.status === 'active' ? 'current' : s.status === 'completed' ? 'done' : null,
      status: s.status,
      eventNote:
        s.status === 'active' ? `stage ${s.stageNumber} of 6`
        : s.status === 'completed' ? (fmtDate(s.completedAt) ? `completed ${fmtDate(s.completedAt)}` : 'complete')
        : s.stageNumber === current + 1 ? `starts when stage ${current} clears`
        : 'upcoming',
      impact,
      milestones: (programme.stages.find(p => p.stageNumber === s.stageNumber)?.milestones || [])
        .map(m => ({ id: m.id, label: m.label, date: m.date, done: m.done })),
      attachments: mine,
      ...(needs ? {} : {}),
    };
  });
}

/**
 * "Catch me up" — what changed, in the order a returning client cares about.
 * Every line is counted from a record; when nothing has moved it says so
 * rather than manufacturing three bullets.
 */
export function buildCatchUp(args: {
  clientActions: ClientActionItem[];
  milestones: PaymentMilestone[];
  milestoneAmount: (m: PaymentMilestone) => number;
  decisions: ProjectDecisionRecord[];
  context: ProjectContext;
}): { lead: string; lines: { bold: string; rest: string }[] } {
  const { clientActions, milestones, milestoneAmount, decisions, context } = args;
  const lines: { bold: string; rest: string }[] = [];

  const pending = decisions.filter(d => d.status === 'pending' || d.status === 'proposed');
  if (pending.length) {
    lines.push({
      bold: pending.length === 1 ? '1 decision' : `${pending.length} decisions`,
      rest: ` ${pending.length === 1 ? 'is' : 'are'} waiting on you — ${pending.map(d => d.title.toLowerCase()).slice(0, 2).join(', ')}.`,
    });
  }

  const updates = ((context as any).siteUpdates || []).filter(isVisibleToClient as any);
  if (updates.length) {
    lines.push({ bold: `${updates.length} site update${updates.length === 1 ? '' : 's'}`, rest: ' have been posted to your feed.' });
  }

  const paid = milestones.filter(m => m.status === 'paid');
  if (paid.length) {
    const total = paid.reduce((sum, m) => sum + milestoneAmount(m), 0);
    lines.push({ bold: formatINR(total), rest: ` cleared across ${paid.length} milestone${paid.length === 1 ? '' : 's'}.` });
  }

  const invoiced = milestones.filter(m => m.status === 'invoiced');
  if (invoiced.length) {
    lines.push({
      bold: `${invoiced.length} invoice${invoiced.length === 1 ? '' : 's'}`,
      rest: ` ${invoiced.length === 1 ? 'is' : 'are'} raised and awaiting payment.`,
    });
  }

  const lead = clientActions.length
    ? `Since you were last here — ${clientActions.length} thing${clientActions.length === 1 ? '' : 's'} need${clientActions.length === 1 ? 's' : ''} you.`
    : 'Since you were last here — nothing needs you.';

  if (lines.length === 0) {
    lines.push({ bold: 'Nothing has moved yet.', rest: ' Your studio will post here as the project starts.' });
  }

  return { lead, lines };
}
