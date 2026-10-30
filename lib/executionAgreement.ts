/*
  WHAT THE EXECUTION AGREEMENT STATES.

  The agreement page kept its own figures. The execution value, design fee and
  a single GST rate were typed into `executionAgreementOverrides` once and then
  won over the project for good, so a discount added in Money, design GST
  switched on, or a revised payment schedule never reached the agreement. On
  Unique Vistas it read "GST (0%)" over both fees and listed the payment
  schedule as it stood when it was first generated.

  Everything the agreement states is now worked out here, from the same places
  the rest of the app reads it:

    - money          Money's billing base, discounts and GST switches
                     (lib/paymentSchedule), so the agreement, the invoices and
                     Annexure A cannot disagree
    - payment rows   the project's milestones as Money bills them
    - people         the client and everyone on the client's side
                     (lib/clientContacts)
    - Annexure F     the approved scope with the bank's descriptions
                     (agreementScope), never "Details missing from bank"

  What the studio edits on the page is kept in `executionAgreementOverrides`
  under the keys below and wins over the live value, field by field. The four
  keys the old page wrote (`executionTotal`, `designFee`, `gstRate`,
  `advances`) are ignored on purpose: they are the stale figures this replaces.

  The studio page and the client's frozen copy both render from
  `resolveAgreement`, so the two read the same.
*/

import { billingBase, computeSchedule, gstTermsOf, resolveFinancials } from './paymentSchedule';
import { clientPeople } from './clientContacts';
import { isPlaceholderText } from './detailedBoq';

export interface AgreementRep {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface AgreementSubClause {
  id: string;
  text: string;
}

export interface AgreementClause {
  id: string;
  /** Optional. With one it reads as a heading ("4.7 Late fees"), without as a numbered clause. */
  heading?: string;
  text: string;
  subClauses: AgreementSubClause[];
}

export interface AnnexBRow {
  id: string;
  item: string;
  included: string;
  charge: string;
}

export interface AnnexCRow {
  id: string;
  category: string;
  procurementBy: string;
  paymentBy: string;
  responsibility: string;
  notes: string;
}

/** The text columns of one payment row, as the studio reworded them. */
export interface ScheduleRowText {
  name?: string;
  trigger?: string;
  due?: string;
  unlocks?: string;
}

export interface AgreementOverrides {
  agreementDate?: string;
  estimatedDuration?: number | string;
  commencementTrigger?: string;
  placeOfSigning?: string;

  clientName?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  projectName?: string;
  projectAddress?: string;

  /** A figure the agreement states instead of Money's. Absent means Money's. */
  executionValueOverride?: number;
  designFeeOverride?: number;

  reps?: AgreementRep[];
  scheduleText?: Record<string, ScheduleRowText>;
  annexB?: AnnexBRow[];
  annexC?: AnnexCRow[];
  /** Annexure F description per BOQ line id. */
  specs?: Record<string, string>;
  /** Clauses the studio added, by article number ('1' to '10'). */
  clauses?: Record<string, AgreementClause[]>;

  [key: string]: any;
}

/**
 * The articles, and the last top-level number each one prints.
 * A clause the studio adds to article 4 is numbered from 4.7.
 */
export const AGREEMENT_ARTICLES: { no: string; title: string; last: number }[] = [
  { no: '1', title: 'Preamble, Definitions and Contract Documents', last: 7 },
  { no: '2', title: 'Scope of Work, BOQ, Exclusions and As-Actuals', last: 7 },
  { no: '3', title: 'Design Deliverables, Approvals, Revisions and Change Requests', last: 5 },
  { no: '4', title: 'Payments, Taxes, Pause Rights and Material Ownership', last: 6 },
  { no: '5', title: 'Execution, Site Protocol, Timeline and Client Responsibilities', last: 6 },
  { no: '6', title: 'Materials, Site Conditions, Tolerances and Substitutions', last: 6 },
  { no: '7', title: 'Completion, Handover, Snag Closure and Warranty', last: 6 },
  { no: '8', title: 'Intellectual Property, Confidentiality and Portfolio Use', last: 5 },
  { no: '9', title: 'Termination, Liability, Indemnity, Force Majeure and Dispute Resolution', last: 6 },
  { no: '10', title: 'Notices, Digital Sign-Off and Acceptance', last: 3 },
];

export const agreementId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const agreementOverrides = (ctx: any): AgreementOverrides =>
  (ctx?.executionAgreementOverrides && typeof ctx.executionAgreementOverrides === 'object')
    ? ctx.executionAgreementOverrides
    : {};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const pick = (override: unknown, ...live: unknown[]): string => {
  if (typeof override === 'string') return override;
  for (const v of live) if (text(v)) return text(v);
  return '';
};
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && isFinite(v) ? v : undefined;
const R = Math.round;

/* ── Parties and project ─────────────────────────────────────────────────── */

export interface AgreementParties {
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  projectName: string;
  projectAddress: string;
  location: string;
  config: string;
  area: number;
}

/*
  A project has no address field, only a `location` ("Thane"), so the box read
  the literal "Client Address". The project address now falls back to the
  location until the studio types the full one in.
*/
export function agreementParties(ctx: any, o: AgreementOverrides = agreementOverrides(ctx)): AgreementParties {
  const location = text(ctx?.location);
  return {
    clientName: pick(o.clientName, ctx?.clientName),
    clientAddress: pick(o.clientAddress, ctx?.clientAddress),
    clientEmail: pick(o.clientEmail, ctx?.clientEmail),
    clientPhone: pick(o.clientPhone, ctx?.clientPhone),
    projectName: pick(o.projectName, ctx?.name),
    projectAddress: pick(o.projectAddress, ctx?.projectAddress, location),
    location,
    config: text(ctx?.config),
    area: Number(ctx?.area) || 0,
  };
}

/* ── Money ───────────────────────────────────────────────────────────────── */

export interface AgreementMoney {
  /** Before discounts. */
  grossExecution: number;
  executionDiscount: number;
  executionDiscountLabel: string;
  netExecution: number;
  grossDesign: number;
  designDiscount: number;
  designDiscountLabel: string;
  netDesign: number;
  gstRate: number;
  /** Percent of execution invoiced with GST. */
  billablePercent: number;
  executionGstOn: boolean;
  designGstOn: boolean;
  executionGst: number;
  designGst: number;
  grandTotal: number;
  /** True where the figure is the studio's, not Money's. */
  executionManual: boolean;
  designManual: boolean;
  /** An agreement issued before the split: one GST line over both fees. */
  combinedGst?: boolean;
}

export interface AgreementScheduleRow {
  /** Milestone id, or `adv-<n>` for a row read off an older schedule. */
  key: string;
  name: string;
  phase: 'design' | 'execution';
  trigger: string;
  due: string;
  unlocks: string;
  percentage: number | null;
  /** Ex-GST. */
  amount: number;
  gst: number;
  total: number;
  status: string;
}

const discountLabel = (fin: any, target: 'execution' | 'design') => {
  const names = (fin.discounts || [])
    .filter((d: any) => d?.target === target)
    .map((d: any) => text(d.name) || (d.type === 'percentage' ? `${d.value}%` : ''))
    .filter(Boolean);
  return names.length ? names.join(', ') : '';
};

/**
 * The figures, as Money bills them unless the studio set a figure by hand.
 *
 * `tierSummary` is the active option's summary (what Money passes). Without
 * one, Money's approved values are the contract.
 */
export function agreementMoney(
  ctx: any,
  tierSummary: { totalSell?: number; designFee?: number } | undefined,
  o: AgreementOverrides = agreementOverrides(ctx),
): { money: AgreementMoney; schedule: AgreementScheduleRow[] } {
  const fin = resolveFinancials(ctx?.financials);
  const base = billingBase(ctx, tierSummary, fin);
  const manualExec = num(o.executionValueOverride);
  const manualDesign = num(o.designFeeOverride);
  const manual = manualExec !== undefined || manualDesign !== undefined;
  const grossExecution = manualExec ?? base.execution;
  const grossDesign = manualDesign ?? base.design;

  /* A figure set by hand is the contract, for the schedule as much as the summary. */
  const sched = computeSchedule(manual
    ? {
        context: ctx,
        tierSummary: { totalSell: grossExecution, designFee: grossDesign },
        overrides: { approvedExecutionValue: grossExecution, approvedDesignValue: grossDesign },
      }
    : { context: ctx, tierSummary });

  const terms = gstTermsOf(ctx);
  const t = sched.totals;
  const money: AgreementMoney = {
    grossExecution: R(grossExecution),
    executionDiscount: R(Math.max(0, grossExecution - t.taxableExecution)),
    executionDiscountLabel: discountLabel(fin, 'execution'),
    netExecution: R(t.taxableExecution),
    grossDesign: R(grossDesign),
    designDiscount: R(Math.max(0, grossDesign - t.taxableDesign)),
    designDiscountLabel: discountLabel(fin, 'design'),
    netDesign: R(t.taxableDesign),
    gstRate: sched.gstRate,
    billablePercent: terms.billablePercent,
    executionGstOn: terms.executionGst && terms.billablePercent > 0,
    designGstOn: terms.designGst,
    executionGst: R(t.gstOnExecution),
    designGst: R(t.gstOnDesign),
    grandTotal: R(t.grossProjectValue),
    executionManual: manualExec !== undefined,
    designManual: manualDesign !== undefined,
  };

  return { money, schedule: agreementSchedule(ctx, sched, money, o) };
}

function agreementSchedule(
  ctx: any,
  sched: ReturnType<typeof computeSchedule>,
  money: AgreementMoney,
  o: AgreementOverrides,
): AgreementScheduleRow[] {
  const words = o.scheduleText || {};
  const withText = (row: AgreementScheduleRow): AgreementScheduleRow => {
    const w = words[row.key] || {};
    return {
      ...row,
      name: typeof w.name === 'string' ? w.name : row.name,
      trigger: typeof w.trigger === 'string' ? w.trigger : row.trigger,
      due: typeof w.due === 'string' ? w.due : row.due,
      unlocks: typeof w.unlocks === 'string' ? w.unlocks : row.unlocks,
    };
  };

  const milestones: any[] = Array.isArray(ctx?.paymentMilestones) ? ctx.paymentMilestones : [];
  if (milestones.length) {
    /* Money's own figures, milestone by milestone, in the order Money lists them. */
    return milestones
      .filter((m) => m && sched.byId[m.id])
      .map((m) => {
        const a = sched.byId[m.id];
        const name = String(m.name || '').replace(' (Gross)', '');
        return withText({
          key: String(m.id),
          name,
          phase: m.type === 'execution' ? 'execution' : 'design',
          trigger: text(m.trigger) || text(m.description)
            || (m.type === 'execution' ? `Advance before ${name.toLowerCase()}` : `On completion of ${name}`),
          due: 'Before stage begins',
          unlocks: text(m.unlocks),
          percentage: m.isFixedAmount ? null : (Number(m.percentage) || 0),
          amount: a.base,
          gst: a.gst,
          total: a.base + a.gst,
          status: a.status,
        });
      });
  }

  /* No milestones in Money: the latest generated schedule, priced on today's figures. */
  const schedules: any[] = Array.isArray(ctx?.paymentSchedules) ? ctx.paymentSchedules : [];
  const latest = schedules.length
    ? schedules.reduce((a, b) => ((b?.version || 0) > (a?.version || 0) ? b : a))
    : null;
  const advances: any[] = latest?.advances || ctx?.engagement?.lockedSnapshot?.advances || [];
  return advances.map((adv, i) => {
    const isExec = adv.phase === 'execution' || adv.phase === 'handover';
    const pct = Number(adv.percentage) || 0;
    const amount = R(adv.isFixedAmount && adv.fixedAmount !== undefined
      ? adv.fixedAmount
      : (isExec ? money.netExecution : money.netDesign) * (pct / 100));
    const gst = R(isExec
      ? (money.executionGstOn ? amount * (money.billablePercent / 100) * (money.gstRate / 100) : 0)
      : (money.designGstOn ? amount * (money.gstRate / 100) : 0));
    return withText({
      key: `adv-${i}`,
      name: text(adv.label) || text(adv.name) || `Stage ${i + 1}`,
      phase: isExec ? 'execution' : 'design',
      trigger: text(adv.dueCondition) || text(adv.description),
      due: 'Before stage begins',
      unlocks: text(adv.unlocks),
      percentage: adv.isFixedAmount ? null : pct,
      amount,
      gst,
      total: amount + gst,
      status: adv.status || 'pending',
    });
  });
}

/* ── People ──────────────────────────────────────────────────────────────── */

/** Everyone on the client's side, main contact first, until the studio edits the list. */
export function defaultReps(ctx: any, parties: AgreementParties): AgreementRep[] {
  const people = clientPeople(ctx);
  if (!people.length) {
    return [{ id: 'main', name: parties.clientName, role: 'Client', email: parties.clientEmail, phone: parties.clientPhone }];
  }
  return people.map((p) => p.main
    ? { id: 'main', name: parties.clientName || p.name, role: 'Client', email: parties.clientEmail || p.email || '', phone: parties.clientPhone || p.phone || '' }
    : { id: p.id, name: p.name, role: p.role || '', email: p.email || '', phone: p.phone || '' });
}

/* ── Annexures B and C ───────────────────────────────────────────────────── */

export const defaultAnnexB = (): AnnexBRow[] => [
  { id: 'b1', item: 'Design Options / Revisions', included: 'Up to 2 per room / area, unless otherwise agreed', charge: 'As quoted per revision / room / drawing' },
  { id: 'b2', item: 'Site Revisit for Client Change', included: 'As per agreed schedule', charge: 'As quoted per visit' },
  { id: 'b3', item: 'Rework After Approval', included: 'Not included', charge: 'Actual cost + labour + material + vendor charges + coordination fee' },
  { id: 'b4', item: 'Additional Drawings', included: 'As per design scope', charge: 'As quoted per drawing / package' },
];

export const defaultAnnexC = (studioName: string): AnnexCRow[] => [
  { id: 'c1', category: 'Lights / Fans / Switches', procurementBy: `Client / ${studioName} / Vendor`, paymentBy: `Client / ${studioName}`, responsibility: 'Design coordination and installation only if included', notes: 'Product warranty by manufacturer' },
  { id: 'c2', category: 'Sanitaryware / CP Fittings', procurementBy: `Client / ${studioName} / Vendor`, paymentBy: `Client / ${studioName}`, responsibility: 'Coordination only unless BOQ includes supply', notes: 'Vendor delay extends timeline' },
  { id: 'c3', category: 'Tiles / Stone / Countertop', procurementBy: `Client / ${studioName} / Vendor`, paymentBy: `Client / ${studioName}`, responsibility: 'Selection support and integration', notes: 'Batch variation applies' },
  { id: 'c4', category: 'Appliances', procurementBy: 'Client', paymentBy: 'Client', responsibility: 'Design provision only unless otherwise stated', notes: 'Installation by brand/vendor unless included' },
  { id: 'c5', category: 'Loose Furniture / Decor', procurementBy: `Client / ${studioName}`, paymentBy: `Client / ${studioName}`, responsibility: 'As per BOQ', notes: `Delivery damage/warranty by vendor unless supplied by ${studioName}` },
];

/* ── Annexure F ──────────────────────────────────────────────────────────── */

export interface AgreementBoqLine {
  id: string;
  name: string;
  room: string;
  cat: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  spec: string;
}

/**
 * The scope lines as Annexure F prints them: the studio's wording for a line
 * first, then what the project carried, then nothing. "Details missing from
 * bank" and the like are placeholders, never a description.
 */
export function agreementBoqLines(
  lines: any[],
  ctx: any,
  o: AgreementOverrides = agreementOverrides(ctx),
): AgreementBoqLine[] {
  const legacy = ctx?.contractContent?.boqItemSpecOverrides || {};
  return (lines || []).map((l: any, i: number) => {
    const id = String(l.id || `line-${i}`);
    const own = o.specs?.[id];
    const spec = typeof own === 'string'
      ? own
      : [legacy[id], l.specs, l.internalSpecs, l.commercialNote].find((s) => !isPlaceholderText(s)) || '';
    const qty = Number(l.qty) || 0;
    const rate = Number(l.unitCost ?? l.rate) || 0;
    return {
      id,
      name: String(l.name || l.description || 'Item'),
      room: String(l.room || l.roomId || 'General Scope'),
      cat: String(l.cat || l.category || l.room || ''),
      unit: String(l.unit || ''),
      qty,
      rate,
      amount: Number(l.finalCost ?? l.amount ?? rate * qty) || 0,
      spec: String(spec).trim(),
    };
  });
}

export function groupBoqLines(lines: AgreementBoqLine[]): Record<string, AgreementBoqLine[]> {
  const out: Record<string, AgreementBoqLine[]> = {};
  lines.forEach((l) => { (out[l.room] = out[l.room] || []).push(l); });
  return out;
}

/* ── Everything ──────────────────────────────────────────────────────────── */

export interface ResolvedAgreement {
  parties: AgreementParties;
  money: AgreementMoney;
  schedule: AgreementScheduleRow[];
  reps: AgreementRep[];
  annexB: AnnexBRow[];
  annexC: AnnexCRow[];
  clauses: Record<string, AgreementClause[]>;
  boq: AgreementBoqLine[];
  boqTotal: number;
  agreementDate: string;
  estimatedDuration: string;
  commencementTrigger: string;
  placeOfSigning: string;
}

export const todayAgreementDate = () =>
  new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function resolveAgreement(
  ctx: any,
  opts: {
    tierSummary?: { totalSell?: number; designFee?: number };
    /** Annexure F's lines, from agreementScope. */
    scopeLines?: any[];
    studioName: string;
    /** Days, from the studio's procurement lead time, when the studio has not set one. */
    defaultDuration?: number;
  },
): ResolvedAgreement {
  const o = agreementOverrides(ctx);
  const parties = agreementParties(ctx, o);
  const { money, schedule } = agreementMoney(ctx, opts.tierSummary, o);
  const boq = agreementBoqLines(opts.scopeLines || [], ctx, o);
  const duration = o.estimatedDuration !== undefined && o.estimatedDuration !== ''
    ? o.estimatedDuration
    : (opts.defaultDuration ?? 60);
  return {
    parties,
    money,
    schedule,
    reps: Array.isArray(o.reps) ? o.reps : defaultReps(ctx, parties),
    annexB: Array.isArray(o.annexB) ? o.annexB : defaultAnnexB(),
    annexC: Array.isArray(o.annexC) ? o.annexC : defaultAnnexC(opts.studioName),
    clauses: o.clauses && typeof o.clauses === 'object' ? o.clauses : {},
    boq,
    boqTotal: R(boq.reduce((s, l) => s + l.amount, 0)),
    agreementDate: text(o.agreementDate) || todayAgreementDate(),
    estimatedDuration: String(duration),
    commencementTrigger: typeof o.commencementTrigger === 'string' ? o.commencementTrigger : 'Site Handover + Advance Clearance',
    placeOfSigning: typeof o.placeOfSigning === 'string' ? o.placeOfSigning : (parties.location || 'Thane'),
  };
}

/**
 * An agreement frozen before this file existed, read into the same shape so the
 * client's issued copy still renders exactly the figures it was issued with.
 */
export function agreementFromLegacySnapshot(snap: any, studioName: string): ResolvedAgreement {
  const o: AgreementOverrides = snap?.overrides || {};
  const designFee = Number(snap?.designFee) || 0;
  const executionTotal = Number(snap?.executionTotal) || 0;
  const gstRate = Number(snap?.gstRate ?? 18);
  const gstAmount = Number(snap?.gstAmount ?? R((designFee + executionTotal) * (gstRate / 100)));
  const parties: AgreementParties = {
    clientName: text(snap?.clientName),
    clientAddress: text(snap?.clientAddress),
    clientEmail: text(snap?.clientEmail),
    clientPhone: text(snap?.clientPhone),
    projectName: text(snap?.projectName),
    projectAddress: text(snap?.clientAddress) || text(snap?.location),
    location: text(snap?.location),
    config: '',
    area: Number(snap?.area) || 0,
  };
  const fin = resolveFinancials(snap?.financials || {});
  const advances: any[] = snap?.allAdvances?.length ? snap.allAdvances : [];
  const schedule: AgreementScheduleRow[] = (advances.length ? advances : (snap?.milestonesList || [])).map((m: any, i: number) => {
    const phase = (m.phase || m.type) === 'execution' || m.phase === 'handover' ? 'execution' : 'design';
    const amount = R(m.amount || (phase === 'execution' ? executionTotal : designFee) * ((Number(m.percentage) || 0) / 100));
    const on = phase === 'execution' ? fin.executionGstEnabled !== false : fin.designGstEnabled !== false;
    const gst = R(on ? amount * (gstRate / 100) : 0);
    return {
      key: String(m.id || `adv-${i}`), name: text(m.label) || text(m.name), phase,
      trigger: text(m.dueCondition) || text(m.description), due: 'Before Stage',
      unlocks: text(m.unlocks) || `${text(m.label) || text(m.name)} progression`,
      percentage: Number(m.percentage) || 0, amount, gst, total: amount + gst, status: m.status || 'pending',
    };
  });
  const boq = agreementBoqLines(snap?.boq || [], { contractContent: { boqItemSpecOverrides: snap?.boqItemSpecOverrides || {} } }, {});
  return {
    parties,
    money: {
      grossExecution: executionTotal, executionDiscount: 0, executionDiscountLabel: '', netExecution: executionTotal,
      grossDesign: designFee, designDiscount: 0, designDiscountLabel: '', netDesign: designFee,
      gstRate, billablePercent: 100, executionGstOn: gstAmount > 0, designGstOn: false,
      executionGst: gstAmount, designGst: 0,
      grandTotal: Number(snap?.grandTotal) || executionTotal + designFee + gstAmount,
      executionManual: false, designManual: false, combinedGst: true,
    },
    schedule,
    reps: [{ id: 'main', name: parties.clientName, role: 'Client', email: parties.clientEmail, phone: parties.clientPhone }],
    annexB: defaultAnnexB(),
    annexC: defaultAnnexC(studioName),
    clauses: {},
    boq,
    boqTotal: executionTotal,
    agreementDate: text(snap?.dateStr) || text(snap?.agreementDate),
    estimatedDuration: String(snap?.estimatedDuration ?? o.estimatedDuration ?? 60),
    commencementTrigger: text(snap?.commencementTrigger) || 'Site Handover + Advance Clearance',
    placeOfSigning: 'Mumbai / Thane / Other',
  };
}
