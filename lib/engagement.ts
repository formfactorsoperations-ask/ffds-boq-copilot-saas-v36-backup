/*
  What the studio has been engaged to do on a project.

  Every project used to be a turnkey job: FFDS designs, buys, builds and bills
  the execution. Some projects are design only (Pali Hill bungalow): FFDS hands
  over drawings, 3D views and specifications and the client hires and pays
  their own contractors. A third kind, design + PMC, adds running the client's
  contractors on site for a fee.

  The choice is stored once per project (`engagementType`) and every screen
  reads it from here: the project rail, the proposal, Money, the journey and the
  project list. Before this, "Design & PMC" was only a view toggle on the
  proposal, so Money, the contract and the site screens all still treated the
  project as turnkey.

  A project with nothing stored is turnkey, which is what every existing project
  has always been, so nothing changes for them and no data needs migrating.
*/

import type { JourneyStepDef } from '../constants/journeyConstants';

export type EngagementType = 'turnkey' | 'design_only' | 'design_pmc';

export interface EngagementDef {
  id: EngagementType;
  label: string;
  /** For chips and badges. */
  short: string;
  /** Before a noun: "a design-only project". */
  adjective: string;
  /** One line, in the studio's words. */
  blurb: string;
}

export const ENGAGEMENTS: EngagementDef[] = [
  { id: 'turnkey', label: 'Turnkey', short: 'Turnkey', adjective: 'turnkey', blurb: 'We design, buy, build and bill the execution' },
  { id: 'design_only', label: 'Design only', short: 'Design', adjective: 'design-only', blurb: 'We hand over drawings, 3D views and specs; the client hires their own contractors' },
  { id: 'design_pmc', label: 'Design + PMC', short: 'Design + PMC', adjective: 'design + PMC', blurb: 'We design and run the client’s contractors on site for a PMC fee' },
];

const VALID = new Set<EngagementType>(ENGAGEMENTS.map((e) => e.id));

/*
  Design + PMC needs its own screens (tender BOQ, PMC agreement, contractor
  bills) before a project can run on it. Until they exist it is listed in
  Studio settings but cannot be switched on, so no project is set up on half
  a workflow.
*/
export const PMC_AVAILABLE = false;

export const engagementDef = (e: EngagementType): EngagementDef =>
  ENGAGEMENTS.find((d) => d.id === e) || ENGAGEMENTS[0];

/** The project's engagement. Nothing stored means turnkey. */
export function engagementOf(ctx: { engagementType?: unknown } | null | undefined): EngagementType {
  const v = ctx?.engagementType;
  return typeof v === 'string' && VALID.has(v as EngagementType) ? (v as EngagementType) : 'turnkey';
}

/** The studio earns fees only: no execution is sold, bought or billed by the studio. */
export const isFeeOnly = (e: EngagementType): boolean => e !== 'turnkey';

/** The proposal template that fits the engagement. */
export const proposalModeFor = (e: EngagementType): 'TURNKEY' | 'DESIGN_ONLY' =>
  e === 'turnkey' ? 'TURNKEY' : 'DESIGN_ONLY';

/** What a new studio offers until it says otherwise. */
export const DEFAULT_OFFERED: EngagementType[] = ['turnkey', 'design_only'];

/**
 * The engagements this studio offers, in display order. Always at least one;
 * Design + PMC only once its screens exist.
 */
export function offeredEngagements(org: { engagementTypesOffered?: unknown } | null | undefined): EngagementType[] {
  const raw = Array.isArray(org?.engagementTypesOffered) ? (org!.engagementTypesOffered as unknown[]) : DEFAULT_OFFERED;
  const picked = ENGAGEMENTS
    .map((d) => d.id)
    .filter((id) => raw.includes(id))
    .filter((id) => id !== 'design_pmc' || PMC_AVAILABLE);
  return picked.length ? picked : ['turnkey'];
}

// ---------------------------------------------------------------------------
// Changing the engagement on a live project
// ---------------------------------------------------------------------------

/* Turnkey takes on the most, design only the least. */
const RANK: Record<EngagementType, number> = { design_only: 0, design_pmc: 1, turnkey: 2 };

export interface EngagementChange {
  ok: boolean;
  /** Why not, in a sentence the studio can act on. */
  reason?: string;
  /** True when the studio is taking on more work, e.g. a design-only client asks FFDS to build. */
  upgrade: boolean;
}

/**
 * Whether a project can move from one engagement to another.
 *
 * Taking on more (design only, then PMC, then turnkey) is always allowed: the
 * design fee already agreed or paid stays as it is and the extra screens open.
 * Stepping down from turnkey is blocked once execution has been agreed or
 * billed, because those invoices and that agreement would then describe work
 * the project no longer has.
 */
export function canChangeEngagement(ctx: any, to: EngagementType): EngagementChange {
  const from = engagementOf(ctx);
  if (from === to) return { ok: true, upgrade: false };
  const upgrade = RANK[to] > RANK[from];
  if (upgrade) return { ok: true, upgrade: true };

  if (from === 'turnkey') {
    const billed = (ctx?.paymentMilestones || []).some(
      (m: any) => m?.type === 'execution' && (m.status === 'invoiced' || m.status === 'paid'),
    );
    if (billed) {
      return { ok: false, upgrade, reason: 'Execution has already been invoiced on this project. Credit those invoices in Money first.' };
    }
    const agreed = ctx?.executionSignoff?.status === 'signed' || ctx?.executionSignoff?.status === 'sent';
    if (agreed) {
      return { ok: false, upgrade, reason: 'The execution agreement has been sent or signed. Withdraw it before changing the engagement.' };
    }
  }
  return { ok: true, upgrade };
}

// ---------------------------------------------------------------------------
// The project rail
// ---------------------------------------------------------------------------

/*
  Screens a fee-only project has no use for. They are taken off the rail, and a
  link that still lands on one (an old bookmark, a journey step) shows a plain
  note instead of an empty screen.

  - ops (Pricing & Tiers), boq-editor, analytics (margin health),
    revision-studio (BOQ revisions), client-boq-pack: there is no BOQ to sell.
  - execution-agreement: the Terms Docket is the design agreement.
  - site-ops, scope-additions, snaglist, checklist: there is no site to run.
*/
const HIDDEN_ROUTES: Record<EngagementType, string[]> = {
  turnkey: [],
  design_only: [
    'ops', 'boq-editor', 'analytics', 'revision-studio', 'client-boq-pack',
    'execution-agreement', 'site-ops', 'scope-additions', 'snaglist', 'checklist',
  ],
  // Provisional, for when PMC opens: the BOQ stays as a tender estimate and the
  // site screens stay; there is no margin and no execution agreement.
  design_pmc: ['ops', 'analytics', 'execution-agreement'],
};

export const isRouteHidden = (e: EngagementType, route: string): boolean =>
  HIDDEN_ROUTES[e].includes(route);

export const hiddenRoutes = (e: EngagementType): string[] => HIDDEN_ROUTES[e];

/* Screens that do a different job on a fee-only project, under the name of that job. */
const RENAMED: Partial<Record<EngagementType, Record<string, string>>> = {
  design_only: { 'design-gate': 'GFC Release', 'handover-docket': 'Design Closeout' },
  design_pmc: { 'handover-docket': 'Handover Docket' },
};

export const routeLabel = (e: EngagementType, route: string, fallback: string): string =>
  RENAMED[e]?.[route] || fallback;

const STAGE_RENAMES: Partial<Record<EngagementType, Record<number, string>>> = {
  design_only: { 5: 'Drawings & Selections', 6: 'Design Closeout' },
  design_pmc: { 5: 'Site Supervision' },
};

export const stageLabel = (e: EngagementType, stage: number, fallback: string): string =>
  STAGE_RENAMES[e]?.[stage] || fallback;

/** Filter and relabel any list of nav items for the engagement. */
export function navItemsFor<T extends { route: string; label: string }>(e: EngagementType, items: T[]): T[] {
  return items
    .filter((it) => !isRouteHidden(e, it.route))
    .map((it) => {
      const label = routeLabel(e, it.route, it.label);
      return label === it.label ? it : { ...it, label };
    });
}

// ---------------------------------------------------------------------------
// The journey (Ops Matrix)
// ---------------------------------------------------------------------------

export interface PhaseDef { id: number; name: string; color: string; emoji: string; desc: string }

const DESIGN_PHASE_NAMES: Record<number, { name: string; desc: string; emoji?: string }> = {
  3: { name: 'Technical Drawings', desc: 'Working drawings and the GFC set', emoji: '📐' },
  4: { name: 'Selections', desc: 'Finishes and fittings locked', emoji: '🧾' },
  5: { name: 'Closeout', desc: 'Final set issued and signed off', emoji: '✅' },
};

/** The six phases, named for the engagement. Turnkey keeps them as they are. */
export function phasesFor(e: EngagementType, phases: PhaseDef[]): PhaseDef[] {
  if (e !== 'design_only') return phases;
  return phases.map((p) => (DESIGN_PHASE_NAMES[p.id] ? { ...p, ...DESIGN_PHASE_NAMES[p.id] } : p));
}

/*
  A design-only project's journey: the turnkey one without the execution, the
  BOQ and the site, plus three steps of its own so every phase has something in
  it. A phase with no steps never reads as complete, and the stage would stop
  advancing there.
*/
const DESIGN_ONLY_KEEP = new Set([
  'discovery_scheduled', 'discovery_completed',
  'brief_frozen', 'space_planning_presented', 'space_planning_approved',
  'visuals_3d_developed', 'visuals_3d_shared', 'revisions_incorporated', 'design_approved',
  'terms_docket_acknowledged', 'payment_schedule_sent', 'design_fee_received', 'onboarding_kit_sent',
  'working_drawings_done',
  'selections_locked',
]);

const DESIGN_ONLY_EDITS: Record<string, Partial<JourneyStepDef>> = {
  // Revision Studio tracks BOQ revisions, which a design-only project has none of.
  visuals_3d_developed: { linkedFeature: 'Drawings', linkedTab: 'drawing-tracker' },
  revisions_incorporated: { linkedFeature: 'Drawings', linkedTab: 'drawing-tracker' },
  design_approved: { linkedFeature: 'GFC Release' },
  terms_docket_acknowledged: { description: 'The design agreement and fee terms acknowledged by the client.' },
  // Turnkey sends the schedule after the BOQ; a design-only fee schedule follows the design agreement.
  payment_schedule_sent: { prerequisiteIds: ['terms_docket_acknowledged'] },
  working_drawings_done: {
    phase: 3, linkedFeature: 'Drawings', linkedTab: 'drawing-tracker',
    description: 'Joinery, electrical, civil and ceiling working drawings complete.',
  },
  selections_locked: { description: 'Finishes and fittings chosen with the client and locked in the Schedule of Finishes.' },
};

export const DESIGN_ONLY_EXTRA_STEPS: JourneyStepDef[] = [
  {
    id: 'gfc_set_issued', n: 0, phase: 3, title: 'GFC Set Issued',
    description: 'The Good for Construction set released to the client and their contractors.',
    illustration: 'working_drawings_done', statusSource: 'auto',
    autoRule: 'project.gfcReleasedAt exists', linkedFeature: 'GFC Release', linkedTab: 'design-gate',
    prerequisiteIds: ['working_drawings_done'],
  },
  {
    id: 'final_design_fee_received', n: 0, phase: 5, title: 'Design Fee Settled',
    description: 'Every design milestone paid.',
    illustration: 'design_fee_received', statusSource: 'auto',
    autoRule: 'paymentMilestones: every design milestone status === "PAID"', linkedFeature: 'Money', linkedTab: 'payment-calc',
    prerequisiteIds: ['selections_locked'],
  },
  {
    id: 'design_closeout_signed', n: 0, phase: 5, title: 'Design Closeout Signed',
    description: 'The client signs off the final drawing set and the design engagement closes.',
    illustration: 'keys_handed_over', statusSource: 'auto',
    autoRule: 'handoverSignoff.status === "signed"', linkedFeature: 'Design Closeout', linkedTab: 'handover-docket',
    prerequisiteIds: ['final_design_fee_received'],
  },
];

/* Where each extra step sits in the list: after the step named. */
const INSERT_AFTER: Record<string, string> = {
  gfc_set_issued: 'working_drawings_done',
  final_design_fee_received: 'selections_locked',
  design_closeout_signed: 'final_design_fee_received',
};

/**
 * The journey steps for the engagement.
 *
 * A kept step whose prerequisite was dropped inherits that step's own
 * prerequisites, walked back until a kept one is reached, so the chain stays
 * in order (onboarding still waits for the agreement, now the terms docket).
 */
export function journeyStepsFor(e: EngagementType, all: JourneyStepDef[]): JourneyStepDef[] {
  if (e !== 'design_only') return all;

  const byId = new Map(all.map((s) => [s.id, s]));
  const resolve = (id: string, seen = new Set<string>()): string[] => {
    if (DESIGN_ONLY_KEEP.has(id)) return [id];
    if (seen.has(id)) return [];
    seen.add(id);
    const s = byId.get(id);
    return s ? s.prerequisiteIds.flatMap((p) => resolve(p, seen)) : [];
  };

  const kept = all
    .filter((s) => DESIGN_ONLY_KEEP.has(s.id))
    .map((s) => {
      const edits = DESIGN_ONLY_EDITS[s.id] || {};
      const prerequisiteIds = Array.from(new Set((edits.prerequisiteIds || s.prerequisiteIds).flatMap((p) => resolve(p))));
      return { ...s, ...edits, prerequisiteIds };
    });

  const out: JourneyStepDef[] = [];
  for (const s of kept) {
    out.push(s);
    for (const extra of DESIGN_ONLY_EXTRA_STEPS) {
      if (INSERT_AFTER[extra.id] === s.id) {
        out.push(extra);
        // An extra can follow another extra.
        for (const next of DESIGN_ONLY_EXTRA_STEPS) {
          if (INSERT_AFTER[next.id] === extra.id) out.push(next);
        }
      }
    }
  }
  return out.map((s, i) => ({ ...s, n: i + 1 }));
}

/*
  The steps that close each lifecycle gate. On a design-only project the
  Terms Docket is the contract and the design closeout is the handover.
*/
export function gateStepIds(e: EngagementType): { contractSigned: string; handoverComplete: string } {
  return e === 'design_only'
    ? { contractSigned: 'terms_docket_acknowledged', handoverComplete: 'design_closeout_signed' }
    : { contractSigned: 'agreement_signed', handoverComplete: 'keys_handed_over' };
}
