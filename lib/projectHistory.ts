import { ProjectContext, HistoryEvent, HistoryCategory } from '../types';

// ============================================================================
// projectHistory — pure diff engine. Given the previous and next persisted
// projectContext, emit human-readable events for the meaningful changes only
// (curated fields, not the whole blob). No I/O, no React — testable in isolation.
// ============================================================================

export const HISTORY_CAP = 150;

const STAGE_NAMES: Record<number, string> = {
  1: 'Initial Consultation', 2: 'Proposal & Pitch', 3: 'Design & Approvals',
  4: 'Pre-Execution', 5: 'Execution', 6: 'Handover & Closeout',
};

const statusLabel = (s?: string) => {
  switch ((s || '').toLowerCase()) {
    case 'paid': case 'received': return 'Paid';
    case 'invoiced': return 'Invoiced';
    case 'advance_requested': return 'Advance requested';
    case 'pending': return 'Pending';
    default: return s || '—';
  }
};

const uid = () => `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

type Draft = { category: HistoryCategory; summary: string; detail?: string | null };

/**
 * Compare two persisted contexts and return events for what changed.
 * `prev == null` (first load / project switch) yields no events.
 */
export function diffHistory(
  prev: ProjectContext | null | undefined,
  next: ProjectContext | null | undefined,
  actor = 'You',
): HistoryEvent[] {
  if (!prev || !next) return [];
  const out: Draft[] = [];
  const push = (category: HistoryCategory, summary: string, detail?: string | null) => out.push({ category, summary, detail });

  // ---- Stage -------------------------------------------------------------
  const ps = prev.lifecycle?.stage, ns = next.lifecycle?.stage;
  if (ns && ps !== ns) {
    push('stage', `Stage → ${STAGE_NAMES[ns] || `Stage ${ns}`}`, ps ? `from ${STAGE_NAMES[ps] || `Stage ${ps}`}` : undefined);
  }

  // ---- Design gate -------------------------------------------------------
  const gPrev = prev.designGate, gNext = next.designGate;
  if (!gPrev?.activated && gNext?.activated) {
    push('design', 'Design Gate activated — BOQ frozen',
      gNext.proceedAnyway ? `Proceeded early: "${gNext.proceedAnyway.reason}"` : undefined);
  }
  if (gPrev?.activated && !gNext?.activated) {
    const last = (gNext?.reopened || [])[gNext!.reopened!.length - 1];
    push('design', 'Design phase reopened', last ? `"${last.reason}"` : undefined);
  }

  // ---- Proposal option ---------------------------------------------------
  if (prev.approvedTierId !== next.approvedTierId && next.approvedTierId) {
    push('design', 'Proposal option selected');
  }
  if ((prev as any).briefFrozenAt == null && (next as any).briefFrozenAt != null) push('design', 'Brief frozen');
  if ((prev as any).designApprovedAt == null && (next as any).designApprovedAt != null) push('design', 'Design approved');

  // ---- Payment milestones -----------------------------------------------
  const pmPrev = new Map((prev.paymentMilestones || []).map((m, i) => [m.id || `idx_${i}`, m]));
  (next.paymentMilestones || []).forEach((m, i) => {
    const o = pmPrev.get(m.id || `idx_${i}`);
    if (!o) { push('money', `Milestone added: ${m.name}`); return; }
    if (o.status !== m.status) push('money', `${m.name} · ${statusLabel(o.status as any)} → ${statusLabel(m.status as any)}`);
    if ((o.percentage || 0) !== (m.percentage || 0)) push('money', `${m.name} split ${o.percentage || 0}% → ${m.percentage || 0}%`);
  });

  // ---- Revisions & discounts --------------------------------------------
  const rp = (prev.boqRevisions || []).length, rn = (next.boqRevisions || []).length;
  if (rn > rp) push('money', `${rn - rp} BOQ revision${rn - rp > 1 ? 's' : ''} recorded`);
  const dp = ((prev as any).financials?.discounts || []).length, dn = ((next as any).financials?.discounts || []).length;
  if (dn > dp) push('money', 'Discount applied');
  else if (dn < dp) push('money', 'Discount removed');

  // ---- Documents / sign-offs --------------------------------------------
  const docSig: { path: string; label: string }[] = [
    { path: 'designAgreementSignoff.status', label: 'Terms docket' },
    { path: 'executionSignoff.status', label: 'Execution agreement' },
  ];
  docSig.forEach(({ path, label }) => {
    const a = get(prev, path), b = get(next, path);
    if (a !== b && b) push('docs', `${label}: ${b === 'signed' ? 'signed' : b === 'sent' ? 'sent to client' : b}`);
  });
  const tdPrev = (prev.termsDockets || []).filter((d: any) => d.status === 'acknowledged').length;
  const tdNext = (next.termsDockets || []).filter((d: any) => d.status === 'acknowledged').length;
  if (tdNext > tdPrev) push('docs', 'Terms docket acknowledged by client');
  if (!(prev as any).onboardingData && (next as any).onboardingData) push('docs', 'Onboarding kit prepared');

  // ---- Scope & handover --------------------------------------------------
  const saPrev = ((prev as any).scopeAdditions || []).length, saNext = ((next as any).scopeAdditions || []).length;
  if (saNext > saPrev) push('scope', `${saNext - saPrev} scope addition${saNext - saPrev > 1 ? 's' : ''} logged`);
  if ((prev as any).handoverDate == null && (next as any).handoverDate != null) push('stage', 'Handover date set');

  const at = Date.now();
  return out.map((d, i) => ({ id: uid() + i, at, actor, category: d.category, summary: d.summary, detail: d.detail ?? null }));
}

/** Append events to a context's history, keeping only the last HISTORY_CAP. */
export function appendHistory(existing: HistoryEvent[] | undefined, events: HistoryEvent[]): HistoryEvent[] {
  if (!events.length) return existing || [];
  return [...(existing || []), ...events].slice(-HISTORY_CAP);
}

export const CATEGORY_META: Record<HistoryCategory, { label: string; dot: string; chip: string }> = {
  stage: { label: 'Stage', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  money: { label: 'Money', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  design: { label: 'Design', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  docs: { label: 'Docs', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  scope: { label: 'Scope', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
};
