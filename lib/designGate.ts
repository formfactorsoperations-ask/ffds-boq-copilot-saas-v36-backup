import { ProjectContext, DesignGateItem, DesignGateState, DrawingTrackerItem } from '../types';

// ============================================================================
// Design Gate — pure logic. No I/O, no React. Everything the component and the
// nav badge need to reason about the Design → Execution handoff lives here so
// it stays testable and consistent across Local and Cloud.
// ============================================================================

export interface GateItemDef {
  key: string;
  label: string;
  hint: string;
  /** Whether an owner/admin role is required to confirm (judgement calls). */
  ownerOnly?: boolean;
  /** Whether this item captures a client sign-off reference. */
  needsReference?: boolean;
  /** How the item is auto-detected from evidence (drawing tracker). */
  auto?: { match?: string[]; kind?: 'gfc' };
}

export const GATE_ITEM_DEFS: GateItemDef[] = [
  { key: 'floor_layout', label: 'Floor layout & space plan approved', hint: 'Approved floor plan / layout drawing', auto: { match: ['floor', 'layout', 'space plan'] } },
  { key: 'elevations', label: 'Elevations / joinery drawings approved', hint: 'Approved elevation or woodwork drawings', auto: { match: ['elevation', 'joinery', 'woodwork'] } },
  { key: 'mep', label: 'Electrical / MEP layout approved', hint: 'Approved electrical / MEP / plumbing layout', auto: { match: ['electrical', 'mep', 'looping', 'plumbing'] } },
  { key: 'gfc', label: 'GFC drawing set marked final', hint: 'At least one drawing issued for construction (GFC)', ownerOnly: true, auto: { kind: 'gfc' } },
  { key: 'client_signoff', label: 'Client sign-off on final drawing set', hint: 'Recorded client approval reference (email / WhatsApp)', needsReference: true },
];

export const GATE_ITEM_COUNT = GATE_ITEM_DEFS.length;

/** Read the drawing tracker off context in whatever shape it happens to be. */
function drawingsFromCtx(ctx: ProjectContext | null | undefined): DrawingTrackerItem[] {
  const dt = (ctx as any)?.drawingTracker;
  if (!dt) return [];
  return Array.isArray(dt) ? dt : Object.values(dt);
}

const isApprovedDrawing = (d: any) =>
  d?.approvedAt != null || d?.status === 'Approved' || d?.status === 'approved';

const matchesAny = (d: any, terms: string[]) =>
  terms.some(t => String(d?.id || '').toLowerCase().includes(t) || String(d?.name || '').toLowerCase().includes(t));

/**
 * Evidence auto-detected from the drawing tracker and project context. Returns a human-readable
 * string per item when evidence exists, else null.
 */
export function autoEvidence(ctx: ProjectContext | null | undefined): Record<string, string | null> {
  const drawings = drawingsFromCtx(ctx);
  const approved = drawings.filter(isApprovedDrawing);
  const ev: Record<string, string | null> = {};

  const currentStage = (ctx?.lifecycle?.stage as number) || (ctx?.currentStage as number) || 1;
  const isExecutionOrLater = currentStage >= 5 || !!ctx?.boqFrozen;
  const designDocs = ctx?.designDocuments || [];
  const commsLog = (ctx as any)?.commsLog || {};
  const hasAgreement = !!ctx?.designAgreementSignoff || (ctx as any)?.engagement?.status === 'signed';

  for (const def of GATE_ITEM_DEFS) {
    if (def.key === 'floor_layout') {
      const hit = approved.find(d => matchesAny(d, ['floor', 'layout', 'space plan']));
      if (hit) {
        ev[def.key] = `Drawing approved — ${hit.name || hit.id}`;
      } else if (designDocs.some(d => (d.title || '').toLowerCase().includes('layout') || (d.title || '').toLowerCase().includes('floor'))) {
        ev[def.key] = 'Layout PDF uploaded to Design Documents';
      } else if ((ctx?.rooms?.length || 0) > 0 && !!ctx?.area) {
        ev[def.key] = `Space plan specified with ${ctx?.rooms?.length} active zones`;
      } else if (isExecutionOrLater) {
        ev[def.key] = 'Cleared in Stage 2/3 milestone handoff';
      } else {
        ev[def.key] = null;
      }
    } else if (def.key === 'elevations') {
      const hit = approved.find(d => matchesAny(d, ['elevation', 'joinery', 'woodwork', 'section']));
      if (hit) {
        ev[def.key] = `Drawing approved — ${hit.name || hit.id}`;
      } else if (designDocs.some(d => (d.title || '').toLowerCase().includes('elevation') || (d.title || '').toLowerCase().includes('section'))) {
        ev[def.key] = 'Elevation drawings in Design Documents';
      } else if (ctx?.designApprovedAt) {
        ev[def.key] = `Design package approved on ${new Date(ctx.designApprovedAt).toLocaleDateString()}`;
      } else if (isExecutionOrLater) {
        ev[def.key] = 'Elevations cleared in proposal signoff';
      } else {
        ev[def.key] = null;
      }
    } else if (def.key === 'mep') {
      const hit = approved.find(d => matchesAny(d, ['electrical', 'mep', 'looping', 'plumbing', 'sanitary']));
      if (hit) {
        ev[def.key] = `Drawing approved — ${hit.name || hit.id}`;
      } else if (designDocs.some(d => (d.title || '').toLowerCase().includes('mep') || (d.title || '').toLowerCase().includes('electrical') || (d.title || '').toLowerCase().includes('plumbing'))) {
        ev[def.key] = 'MEP layout attached in Design Documents';
      } else if (isExecutionOrLater) {
        ev[def.key] = 'MEP drawings validated for execution';
      } else {
        ev[def.key] = null;
      }
    } else if (def.key === 'gfc') {
      const hit = drawings.find(d => (d as any)?.gfc?.status === 'issued' || (d as any)?.gfc?.isIssued || (d as any)?.status === 'GFC Issued');
      if (hit) {
        ev[def.key] = `GFC issued — ${hit.name || hit.id}`;
      } else if (drawings.length > 0 && drawings.every(d => isApprovedDrawing(d))) {
        ev[def.key] = `All ${drawings.length} drawings in tracker approved`;
      } else if (isExecutionOrLater) {
        ev[def.key] = 'GFC drawing package marked complete';
      } else {
        ev[def.key] = null;
      }
    } else if (def.key === 'client_signoff') {
      if (ctx?.designApprovedAt) {
        ev[def.key] = `Design approved ${new Date(ctx.designApprovedAt).toLocaleDateString()}`;
      } else if (hasAgreement) {
        ev[def.key] = 'Signed Execution Agreement on file';
      } else if (commsLog['design_approved']?.status === 'sent' || commsLog['contract_sent']?.status === 'sent') {
        ev[def.key] = 'Client approval logged in Communications';
      } else if (isExecutionOrLater) {
        ev[def.key] = 'Recorded in project activation';
      } else {
        ev[def.key] = null;
      }
    } else {
      ev[def.key] = null;
    }
  }
  return ev;
}

/** Fresh gate with all items unconfirmed. */
export function defaultGate(): DesignGateState {
  return {
    items: GATE_ITEM_DEFS.map(d => ({ key: d.key, done: false, confirmedAt: null, confirmedBy: null, reference: null })),
    activated: false,
    activatedAt: null,
    activatedBy: null,
    stage3InvoiceId: null,
    proceedAnyway: null,
    reopened: [],
  };
}

/**
 * Read the gate off context, backfilling for legacy projects that predate the
 * designGate field. If the lifecycle gate or boqFrozen already say the project
 * moved past design, we synthesize an activated gate so history reads right.
 */
export function migrateGate(ctx: ProjectContext | null | undefined): DesignGateState {
  const existing = (ctx as any)?.designGate as DesignGateState | undefined;
  if (existing && Array.isArray(existing.items)) {
    // Ensure every defined item is present (in case defs grew since last save).
    const byKey = new Map(existing.items.map(i => [i.key, i]));
    const items = GATE_ITEM_DEFS.map(d => byKey.get(d.key) || { key: d.key, done: false, confirmedAt: null, confirmedBy: null, reference: null });
    return { ...existing, items, reopened: existing.reopened || [] };
  }
  const legacyActive = !!(ctx?.lifecycle?.gates?.designGateActive?.done) || !!ctx?.boqFrozen;
  const gate = defaultGate();
  if (legacyActive) {
    gate.activated = true;
    gate.activatedAt = ctx?.lifecycle?.gates?.designGateActive?.at || Date.now();
    gate.items = gate.items.map(i => ({ ...i, done: true }));
  }
  return gate;
}

export interface EffectiveItem extends GateItemDef {
  done: boolean;
  source: 'manual' | 'auto' | 'override';
  evidence: string | null;
  reference: string | null;
  confirmedAt: number | null;
  confirmedBy?: string | null;
  manualOverride?: 'checked' | 'unchecked' | null;
}

/**
 * Combine stored manual confirmations with live auto-evidence.
 * If user explicitly set manualOverride, it takes precedence.
 * Otherwise, auto-detected evidence marks done, or stored manual done stands.
 */
export function computeItems(gate: DesignGateState, ctx: ProjectContext | null | undefined): EffectiveItem[] {
  const ev = autoEvidence(ctx);
  const stored = new Map((gate.items || []).map(i => [i.key, i]));
  return GATE_ITEM_DEFS.map(def => {
    const s = stored.get(def.key);
    const evidence = ev[def.key];
    const hasAutoEvidence = !!evidence;

    let isDone = false;
    let source: 'manual' | 'auto' | 'override' = 'manual';

    if (s?.manualOverride === 'checked') {
      isDone = true;
      source = 'override';
    } else if (s?.manualOverride === 'unchecked') {
      isDone = false;
      source = 'override';
    } else if (hasAutoEvidence) {
      isDone = true;
      source = 'auto';
    } else {
      isDone = !!s?.done;
      source = 'manual';
    }

    return {
      ...def,
      source,
      done: isDone,
      evidence: evidence || null,
      reference: s?.reference || null,
      confirmedAt: s?.confirmedAt || null,
      confirmedBy: s?.confirmedBy || null,
      manualOverride: s?.manualOverride || null,
    };
  });
}

export interface GateReadiness {
  done: number;
  total: number;
  pct: number;
  allClear: boolean;
  blockers: EffectiveItem[];
}

export function gateReadiness(gate: DesignGateState, ctx: ProjectContext | null | undefined): GateReadiness {
  const items = computeItems(gate, ctx);
  const done = items.filter(i => i.done).length;
  const total = items.length;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    allClear: done === total,
    blockers: items.filter(i => !i.done),
  };
}
