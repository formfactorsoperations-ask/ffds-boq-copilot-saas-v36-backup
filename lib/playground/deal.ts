/*
  The deal on a Playground option (BOQ Playground PR P, as in the approved
  mockup): offers on top of the BOQ, the design fee, GST and what the client
  pays, with how long the proposal holds.

  Offers are the project's discounts (`financials.discounts`, lib/offers.ts),
  the same list Money & Offers writes: Money, the proposal and the agreement
  read one set of figures. What the client pays is `dealFor`; the stages are
  `scheduleFor`; the validity is `proposal.validUntil`. Nothing here computes a
  figure of its own.
*/
import type { ProjectContext, TermsSettings, ProposalRecord } from '../../types';
import {
  offerDiscount, staleOffer, refreshedOffer, specialAmount,
  type OfferDiscount, type ScopeSplit, type SplitLine, type ScopePart, type SpecialContext,
} from '../offers';
import { validityDaysOf, validUntil } from '../annexure';
import { DEFAULT_FINANCIALS } from '../paymentSchedule';

/** The longest a proposal may be held open for, in days. */
export const MAX_VALID_DAYS = 90;

export const clampDays = (n: number) => Math.min(MAX_VALID_DAYS, Math.max(1, Math.round(Number(n) || 0) || 1));

export interface Validity {
  /** Days it holds. */
  days: number;
  /** The studio's default, from Terms & Payment. */
  studioDays: number;
  /** It has gone to the client. */
  issued: boolean;
  /** The day it is counted from: the issue date, or today while it is a draft. */
  from: Date;
  until: Date;
  /** Issued and past its date: the offers lapsed with it. */
  expired: boolean;
}

/** How long the proposal holds: the project's own days, else the studio's. */
export function proposalValidity(ctx: Pick<ProjectContext, 'proposal'> | null | undefined, terms: Pick<TermsSettings, 'proposalValidityDays'> | null | undefined, now = Date.now(), tierId?: string): Validity {
  const p: ProposalRecord = ctx?.proposal || {};
  const studioDays = validityDaysOf(terms);
  const days = Number(p.validDays) >= 1 ? clampDays(Number(p.validDays)) : studioDays;
  /* Issued on this version: a newer version is a draft until it is sent in its turn. */
  const issued = typeof p.issuedAt === 'number' && p.issuedAt > 0 && (!tierId || !p.tierId || p.tierId === tierId);
  const from = new Date(issued ? p.issuedAt! : now);
  const until = issued && typeof p.validUntil === 'number' ? new Date(p.validUntil) : validUntil(from, days);
  return { days, studioDays, issued, from, until, expired: issued && now > until.getTime() };
}

/** The project with the proposal held open for `days` (a draft: the date follows the issue). */
export const withValidDays = (prev: ProjectContext, days: number): ProjectContext =>
  ({ ...prev, proposal: { ...(prev.proposal || {}), validDays: clampDays(days) } });

export const discountsOf = (ctx: ProjectContext | null | undefined): OfferDiscount[] =>
  ((ctx?.financials as any)?.discounts || []) as OfferDiscount[];

/**
 * The project's financials record to write into. A project with none bills by
 * the studio's defaults (lib/paymentSchedule resolveFinancials), GST on the
 * work included; a record without the GST flags reads them as off. So the first
 * write carries the flags as they were read, and an offer or the initiation fee
 * never switches the GST off by creating the record.
 */
export function financialsFor(prev: Pick<ProjectContext, 'financials'>): Record<string, any> {
  const f = prev.financials as any;
  if (f && typeof f === 'object') return f;
  return { executionGstEnabled: DEFAULT_FINANCIALS.executionGstEnabled, designGstEnabled: DEFAULT_FINANCIALS.designGstEnabled };
}

/** The project with its offers replaced. */
export const withDiscounts = (prev: ProjectContext, next: OfferDiscount[]): ProjectContext =>
  ({ ...prev, financials: { ...financialsFor(prev), discounts: next } } as ProjectContext);

/** The project with the Project Initiation Fee it has paid. */
export const withInitiationFee = (prev: ProjectContext, value: number): ProjectContext =>
  ({ ...prev, financials: { ...financialsFor(prev), initiationFeePaid: Math.max(0, Math.round(value)) } } as ProjectContext);

/**
 * The offers brought up to date with the BOQ: an offer priced on this option
 * (or an earlier version of it) re-prices when a line changes, and a special
 * price is worked out again so the client still pays its target. Null when
 * nothing moved. Offers made on another option, or typed by hand, stay as they are.
 */
export function followBoq(
  discounts: OfferDiscount[],
  tierId: string,
  split: ScopeSplit,
  special: Omit<SpecialContext, 'others'>,
  sameOption?: (a: string, b: string) => boolean,
): OfferDiscount[] | null {
  let changed = false;
  /* The special price comes last: it is worked out against the others as they will be. */
  const first = discounts.map(d => {
    if (!d.basis || d.basis.kind === 'special') return d;
    const now = staleOffer(d, tierId, split, sameOption);
    if (now === null) return d;
    changed = true;
    return refreshedOffer(d, tierId, now);
  });
  const next = first.map(d => {
    if (d.basis?.kind !== 'special') return d;
    const now = staleOffer(d, tierId, split, sameOption, { ...special, others: first });
    if (now === null) return d;
    changed = true;
    return refreshedOffer(d, tierId, now);
  });
  return changed ? next : null;
}

/** A line given at no charge, or taken back: one complimentary offer per option, as the mockup keeps it. */
export function withComplimentary(discounts: OfferDiscount[], tierId: string, line: Pick<SplitLine, 'key' | 'name'>, on: boolean, split: ScopeSplit, part: ScopePart, newId: () => string): OfferDiscount[] {
  const i = discounts.findIndex(d => d.basis?.kind === 'complimentary' && d.basis.tierId === tierId);
  const cur = i >= 0 ? discounts[i] : null;
  const lines = cur && cur.basis?.kind === 'complimentary' ? cur.basis.lines : [];
  const nextLines = on
    ? (lines.some(l => l.key === line.key) ? lines : [...lines, { key: line.key, name: line.name }])
    : lines.filter(l => l.key !== line.key);
  if (!nextLines.length) return cur ? discounts.filter((_, j) => j !== i) : discounts;
  const basis = { kind: 'complimentary' as const, part: cur?.basis?.kind === 'complimentary' ? cur.basis.part : part, lines: nextLines, tierId };
  const d = offerDiscount(cur?.id || newId(), basis, split);
  return cur ? discounts.map((x, j) => (j === i ? d : x)) : [...discounts, d];
}

/**
 * A special price: what the client should pay, all in. Any special price before
 * it goes; the difference from the rest of the deal becomes one offer off the
 * work. Null when the target is not below what the client pays without it.
 */
export function withSpecial(discounts: OfferDiscount[], tierId: string, target: number, split: ScopeSplit, special: Omit<SpecialContext, 'others'>, newId: () => string): OfferDiscount[] | null {
  const others = discounts.filter(d => d.basis?.kind !== 'special');
  const amount = specialAmount(target, { ...special, others });
  if (amount === null) return null;
  return [...others, offerDiscount(newId(), { kind: 'special', target: Math.round(target), tierId }, split, { ...special, others })];
}
