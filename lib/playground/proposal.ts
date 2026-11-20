/*
  The first proposal, page by page (BOQ Playground PR P, as in the approved
  mockup and the plan's "The proposal PDF, page by page").

  It goes out before booking, as an A4 PDF, sent by WhatsApp and recorded on
  the project. It never draws the plan with pieces: the drawing gate holds
  until the layout is approved. What it says comes from one source each:

    the work, room by room      the BOQ, each amount rounded as Money reads it
    offers, fee, GST, pays      dealFor, on the project's offers
    how the client pays         scheduleFor
    how long it holds           proposal.validUntil (else the studio's days)
    the terms                   Annexure A from Terms & Payment (lib/annexure)

  No cost, markup or margin reaches a page. This file builds the pages' content;
  components/playground/ProposalPdf.tsx lays them out, and lib/proposalPdf.ts
  (the Client Proposal's own PDF builder) turns its A4 sheets into the file.
*/
import type { BoqItem, Item, ProjectContext, ProposalTier, Room, TermsSettings, ProposalRecord } from '../../types';
import { resolveBoqLine } from '../boqPricing';
import { withPlanQty, lineAmount, lineAmountsByRoom, sharesOf, type LineAmountOptions } from './pricing';
import { drawOf, pieceItemOf, pieceSize } from './pieces';
import { basisOfUnit, readSize, formatSize } from '../boqSize';
import { ftin } from './geometry';
import { realRooms } from '../scopeBuckets';
import { clientDescription } from '../detailedBoq';
import { separateOf, type SeparateRow } from './supply';
import { currentVersion, versionAt, GRADE_TIER, type MaterialSpecsBank, type Grade } from '../materialSpecs';
import { gradeOf, recipeOf, specsFromRecipe, staleParts } from '../lineSpecs';
import {
  annexureOf, fillClause, hasCivilWork, assumptionsFor, warrantySentence, validitySentence, STANDARD_INITIATION_FEE,
} from '../annexure';
import { clampDays } from './deal';

/* ───────────────────────────── the pages and their order ───────────────────────────── */

export type PageKey = 'cover' | 'sum' | 'brief' | 'how' | 'home' | 'items' | 'sep' | 'mat' | 'inv' | 'next' | 'annex';

/** The lead profile's main concerns: each shapes the page order. */
export const CONCERNS = ['Itemized Costs', 'Overall Budget', 'Timeline', 'Design Details', 'Trust'] as const;
export type Concern = (typeof CONCERNS)[number];

/**
 * The page order for a main concern (the plan's table): Overall budget moves
 * the investment up to follow the brief; Trust puts How we work first; Design
 * details puts the materials before the items. Annexure A is always last. The
 * one-page summary shows only when other decision makers are named.
 */
export function pageOrder(concern: string | null | undefined, summary: boolean): PageKey[] {
  const order: PageKey[] = concern === 'Overall Budget' ? ['cover', 'sum', 'brief', 'inv', 'how', 'home', 'items', 'sep', 'mat', 'next', 'annex']
    : concern === 'Trust' ? ['cover', 'sum', 'how', 'brief', 'home', 'items', 'sep', 'mat', 'inv', 'next', 'annex']
    : concern === 'Design Details' ? ['cover', 'sum', 'brief', 'how', 'home', 'mat', 'items', 'sep', 'inv', 'next', 'annex']
    : ['cover', 'sum', 'brief', 'how', 'home', 'items', 'sep', 'mat', 'inv', 'next', 'annex'];
  return summary ? order : order.filter(k => k !== 'sum');
}

/* ───────────────────────────── room by room ───────────────────────────── */

export interface PdfRow {
  id: string;
  name: string;
  /** Its materials, shortly (and, for a shared line, that it is measured from the room). */
  sub: string;
  /** Its size, shown with the quantity: "6′ × 7′", "8′ long". */
  size?: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  /** Given at no charge: struck through, and ₹0. */
  free?: boolean;
}

export interface PdfRoom {
  name: string;
  /** "12′ × 13′ from the brief" */
  size: string;
  rows: PdfRow[];
  total: number;
}

export interface PdfItems {
  rooms: PdfRoom[];
  /** Lines for the whole flat, not shared into rooms. */
  flat: PdfRoom | null;
  /** The work: every row's amount, which is the option's work value. */
  work: number;
}

const LIVE = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';
const PLAIN = /imported via excel/i;

/**
 * A line's size, width × height ("6′ × 7′") for a piece priced by area, its
 * run ("8′ long") for one priced by length; from its drawing when it is on the
 * plan, else from its typed size. Empty when it has none, or is measured from
 * the room (a shared or civil line).
 */
export function sizeOfLine(line: BoqItem, bankMap: Map<string, Item>): string {
  if (line.civil || line.byRoom) return '';
  const r = resolveBoqLine(line, bankMap);
  const unit = r.unit || bankMap.get(line.bankId)?.unit || '';
  const basis = basisOfUnit(unit);
  if (basis !== 'area' && basis !== 'length') return '';
  const pieceItem = pieceItemOf(line, bankMap);
  const draw = line.place ? drawOf(pieceItem) : null;
  if (draw) {
    const s = pieceSize(line, pieceItem, draw);
    return basis === 'area' ? `${ftin(s.w)} × ${ftin(s.h)}` : `${ftin(s.w)} long`;
  }
  const s = readSize({ ...line, unit });
  if (!s) return '';
  const dims = [s.a, s.b].filter((d): d is number => !!d && d > 0);
  if (!dims.length) return '';
  if (s.unit === 'ft') return basis === 'length' && dims.length === 1 ? `${ftin(dims[0])} long` : dims.map(ftin).join(' × ');
  return formatSize(s);
}

/** The size a line is allowed for, as the client reads it: "up to 6′ × 7′", "about 8′ run". */
export function allowanceOf(line: BoqItem, bankMap: Map<string, Item>): string {
  const s = sizeOfLine(line, bankMap);
  if (!s) return '';
  return /long$/.test(s) ? `about ${s.replace(/ long$/, '')} run` : /×/.test(s) ? `up to ${s}` : s;
}

/** A line's materials, shortly: three material names, else its words cut to a line. */
export function shortSpec(line: BoqItem, item: Item | undefined, specBank?: MaterialSpecsBank | null): string {
  const specs = line.materialSpecs;
  if (specs && specBank) {
    const names = Object.entries(specs).filter(([part]) => !/inner/i.test(part)).slice(0, 3)
      .map(([, s]) => specBank.materials.find(m => m.id === s.id)?.name.split(',')[0]).filter(Boolean);
    if (names.length) return names.join(' · ');
  }
  const w = clientDescription(line, item) || '';
  if (!w || PLAIN.test(w)) return '';
  const t = w.replace(/\.$/, '');
  return t.length > 70 ? `${t.slice(0, 69).trimEnd()}…` : t;
}

const roomSize = (r: Room) => (r.plan ? `${ftin(r.plan.w)} × ${ftin(r.plan.h)}` : Number(r.size) ? `${Math.round(Number(r.size))} sq ft` : '');

/**
 * Every item of the option, room by room: the lines bought by the client and
 * those at actuals left out (they have their own page); a whole-flat line in
 * each room it is shared into, measured from the room; the lines for the whole
 * flat after. Each amount is the one Money reads, so the rows add up to the work.
 */
export function itemsOf(args: {
  boq: BoqItem[];
  bankMap: Map<string, Item>;
  pricing: LineAmountOptions | null;
  rooms: Room[];
  /** Lines given at no charge (their keys). */
  free?: Set<string>;
  specBank?: MaterialSpecsBank | null;
}): PdfItems {
  const { bankMap, pricing, free = new Set() } = args;
  const rooms = realRooms(args.rooms);
  const byRoom = new Map<string, PdfRow[]>();
  const flatRows: PdfRow[] = [];
  const push = (room: string, row: PdfRow) => {
    if (rooms.some(r => r.name === room)) { if (!byRoom.has(room)) byRoom.set(room, []); byRoom.get(room)!.push(row); } else flatRows.push(row);
  };
  (args.boq || []).filter(LIVE).forEach((raw, i) => {
    const line = pricing ? withPlanQty(raw, bankMap, pricing) : raw;
    const r = resolveBoqLine(line, bankMap);
    if (!r.billable || r.asActuals || !(r.qty > 0)) return;
    const item = bankMap.get(line.bankId);
    const id = String(line.id || `${r.key}#${i}`);
    const spec = shortSpec(line, item, args.specBank);
    const shares = pricing ? sharesOf(line, pricing) : null;
    if (shares) {
      const amounts = lineAmountsByRoom(line, bankMap, pricing!);
      const measured = line.byRoom?.basis === 'points' ? '' : 'measured from the room';
      shares.forEach((q, room) => {
        if (!(q > 0)) return;
        push(room, { id: `${id}@${room}`, name: r.name, sub: [spec, measured].filter(Boolean).join(' · '), qty: q, unit: r.unit, rate: r.rate, amount: amounts.get(room) || 0, free: free.has(id) || undefined });
      });
      return;
    }
    const amount = pricing ? lineAmount(line, bankMap, pricing) : r.total;
    const size = sizeOfLine(line, bankMap);
    push(r.room, { id, name: r.name, sub: spec, ...(size ? { size } : {}), qty: r.qty, unit: r.unit, rate: r.rate, amount, free: free.has(id) || undefined });
  });
  const total = (rows: PdfRow[]) => rows.reduce((a, x) => a + x.amount, 0);
  const out = rooms.filter(r => byRoom.has(r.name)).map(r => ({ name: r.name, size: roomSize(r), rows: byRoom.get(r.name)!, total: total(byRoom.get(r.name)!) }));
  const flat = flatRows.length ? { name: 'Across the flat', size: '', rows: flatRows, total: total(flatRows) } : null;
  return { rooms: out, flat, work: out.reduce((a, r) => a + r.total, 0) + (flat?.total || 0) };
}

/**
 * The item pages: rooms kept whole where they fit, as the mockup lays them
 * out (about 700 px of rows on the first page, 800 after). A room taller than
 * a page goes on a page of its own.
 */
export function paginateRooms(blocks: PdfRoom[], first = 700, rest = 800): PdfRoom[][] {
  const h = (b: PdfRoom) => 72 + b.rows.reduce((a, r) => a + (r.sub || r.size ? 46 : 30), 0);
  const pages: PdfRoom[][] = [];
  let cur: PdfRoom[] = [];
  let used = 0;
  blocks.forEach(b => {
    const cap = pages.length === 0 ? first : rest;
    if (cur.length && used + h(b) > cap) { pages.push(cur); cur = []; used = 0; }
    cur.push(b);
    used += h(b);
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/* ───────────────────────────── bought by you, and at actuals ───────────────────────────── */

export interface PdfSeparate { actuals: SeparateRow[]; client: SeparateRow[]; estimate: number }

/** The lines kept apart from the price; null when there are none (the page is left out). */
export function separatePage(boq: BoqItem[], bankMap: Map<string, Item>): PdfSeparate | null {
  const s = separateOf(boq, bankMap);
  return s.actuals.length || s.client.length ? s : null;
}

/* ───────────────────────────── three ways to finish it ───────────────────────────── */

export interface PdfMaterialCell { words: string; brand: string; range: string }
export interface PdfMaterials {
  options: { name: string; grade: Grade; recommended: boolean }[];
  rows: { part: string; cells: (PdfMaterialCell | null)[] }[];
  /** The outer-finish ranges, with a few example shades each. */
  ranges: { name: string; count: number; unit: string; hexes: string[] }[];
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * The materials of each option, part by part: each option's grade picks the
 * recipe column (lib/lineSpecs gradeOf). One row per family the recipes use, in
 * the bank's order. Null without a Material specs bank.
 */
export function materialsPage(bank: MaterialSpecsBank | null | undefined, options: Pick<ProposalTier, 'id' | 'name' | 'specGrade'>[], recommendedId: string): PdfMaterials | null {
  if (!bank || !options.length) return null;
  const parts = Object.values(bank.recipes || {}).flatMap(r => r.parts);
  if (!parts.length) return null;
  const opts = options.map(t => ({ name: t.name || 'Option', grade: gradeOf(t), recommended: t.id === recommendedId }));
  const rows = bank.families.filter(f => parts.some(p => p.fam === f.id)).map(f => ({
    part: f.name,
    cells: opts.map(o => {
      const id = parts.find(p => p.fam === f.id && p.byGrade[o.grade])?.byGrade[o.grade];
      const h = id ? currentVersion(bank, id) : undefined;
      if (!h) return null;
      return { words: cap(h.words), brand: h.brand || '', range: h.range ? `Any of ${Number(h.range.count).toLocaleString('en-IN')}+ ${h.range.unit}` : '' };
    }),
  })).filter(r => r.cells.some(Boolean));
  const ranges = bank.materials.filter(m => bank.families.find(f => f.id === m.fam)?.finish).map(m => {
    const h = currentVersion(bank, m.id);
    return h?.range ? { name: m.name.split(',')[0], count: Number(h.range.count) || 0, unit: h.range.unit, hexes: (h.range.examples || []).slice(0, 6).map(e => e.hex) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return { options: opts, rows, ranges };
}

/* ───────────────────────────── Annexure A ───────────────────────────── */

export interface PdfAnnexSection { n: number; title: string; items?: string[]; ordered?: boolean; pair?: { a: [string, string[]]; b: [string, string[]] }; table?: [string, number][]; text?: string }

export interface AnnexInput {
  terms: TermsSettings | null | undefined;
  studioName: string;
  gstRate: number;
  /** The work after offers, the design fee, GST and the total: the deal's figures. */
  after: number;
  fee: number;
  gst: number;
  total: number;
  initiationFee: number;
  boq: BoqItem[];
  bankMap: Map<string, Item>;
  validDays: number;
  issued: Date;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** What the BOQ does not price, for clause 7. */
export function exclusionsOf(boq: BoqItem[], bankMap: Map<string, Item>): string[] {
  const live = (boq || []).filter(l => LIVE(l) && resolveBoqLine(l, bankMap).billable);
  const has = (re: RegExp) => live.some(l => re.test(`${bankMap.get(l.bankId)?.cat || ''} ${resolveBoqLine(l, bankMap).name}`));
  return [
    !has(/floor|tiling|tile/i) && 'Flooring, tiling and stone work',
    !has(/waterproof/i) && 'Waterproofing works',
    'Loose furniture, unless listed: sofas, chairs, dining sets, coffee tables',
    'White goods, kitchen hobs, chimneys and electrical appliances, unless listed',
    'Décor, soft furnishings, art and plants',
    'Government, municipal and society charges, deposits and permissions',
  ].filter((x): x is string => !!x);
}

/**
 * Annexure A's twelve clauses, filled for this project: the wording from Terms
 * & Payment, the figures from the deal, the exclusions and assumptions from the
 * BOQ, the warranty from the warranty periods, and the validity sentence last.
 */
export function annexOf(a: AnnexInput): PdfAnnexSection[] {
  const x = annexureOf(a.terms);
  const tokens = { companyName: a.studioName, gstRate: String(a.gstRate), designFee: inr(a.fee), executionValue: inr(a.after), initiationFee: inr(a.initiationFee || STANDARD_INITIATION_FEE) };
  /* A clause written with its own ✕ or bullet (the booklet draws those by CSS) is printed without it: the list draws its own. */
  const fill = (list: { text: string }[]) => list.map(c => fillClause(c.text, tokens).replace(/^\s*[✕×•·-]\s*/, ''));
  const civil = hasCivilWork((a.boq || []).map(l => ({ ...l, name: resolveBoqLine(l, a.bankMap).name, cat: a.bankMap.get(l.bankId)?.cat })));
  const actuals = (a.boq || []).some(l => l.boqStatus === 'as_actuals' || l.boqStatus === 'client_procured');
  return [
    { n: 1, title: 'Engagement model and basis of value', ordered: true, items: [
      `A single design-led turnkey engagement. ${a.studioName} contracts, procures, executes and supervises the scope listed in this proposal.`,
      'The figure in this proposal is the Current Proposed Project Value, based on the scope, quantities and specifications recorded now.',
      'The Final Turnkey Order Value is issued after site validation, design freeze, Schedule of Finishes approval and the final BOQ sign-off.',
    ] },
    { n: 2, title: 'Commercial summary', table: [['The work, after offers', a.after], ['Design fee', a.fee], [`GST at ${a.gstRate}%`, a.gst], ['Total', a.total]] },
    { n: 3, title: 'Taxes', ordered: true, items: fill(x.taxes) },
    { n: 4, title: 'Payment terms', ordered: true, items: fill(x.paymentTerms) },
    { n: 5, title: 'Project initiation fee', pair: { a: ['Covered by the fee', fill(x.initiationCovered)], b: ['Not covered by the fee', fill(x.initiationNotCovered)] } },
    { n: 6, title: 'Scope, quantities and variations', ordered: true, items: [
      ...fill(x.scope),
      ...(actuals ? ['Items listed under “Bought by you, and at actuals” are not in the total. Items at actuals are paid by you to the vendor at actual cost; their figures are estimates.'] : []),
    ] },
    { n: 7, title: 'Exclusions', items: exclusionsOf(a.boq, a.bankMap) },
    { n: 8, title: 'Programme and start conditions', text: 'The site programme starts once all of the following are in place:', items: fill(x.startConditions) },
    { n: 9, title: 'Assumptions and your responsibilities', pair: { a: ['Assumptions', fill(assumptionsFor(x, civil))], b: ['Your responsibilities', fill(x.clientResponsibilities)] } },
    { n: 10, title: 'Materials, samples and workmanship', ordered: true, items: fill(x.materials) },
    { n: 11, title: 'Handover, warranty and validity', ordered: true, items: [
      ...fill(x.handover),
      warrantySentence(a.studioName, a.terms?.warrantyPeriods),
      ...fill(x.handoverAfter),
      `${validitySentence(a.validDays, a.issued)} The offers in it lapse on the same date.`,
      ...fill(x.closing),
    ] },
    { n: 12, title: 'Acknowledgement', text: 'Signed by both parties on booking. The turnkey agreement and the final BOQ then form the contract.' },
  ];
}

/* ───────────────────────────── sending it ───────────────────────────── */

export interface ProposalSend {
  at: number;
  via: 'whatsapp' | 'download';
  tierId: string;
  validUntil: number;
  by?: string;
}

export type ProposalWithSends = ProposalRecord & { sends?: ProposalSend[] };

/**
 * The project once the proposal has gone to the client: issued today, valid
 * for its days from today (a proposal sent again is held from the new date),
 * the version it went out on, how much price it showed and what it was shaped
 * for. Each send is kept.
 */
export function issueProposal(prev: ProjectContext, s: { tierId: string; at: number; via: ProposalSend['via']; days: number; priceDetail?: ProposalRecord['priceDetail']; shapedFor?: string; by?: string }): ProjectContext {
  const days = clampDays(s.days);
  const until = new Date(s.at);
  until.setDate(until.getDate() + days);
  const was = (prev.proposal || {}) as ProposalWithSends;
  const proposal: ProposalWithSends = {
    ...was,
    issuedAt: s.at,
    validDays: days,
    validUntil: until.getTime(),
    tierId: s.tierId,
    priceDetail: s.priceDetail || was.priceDetail || 'lines',
    ...(s.shapedFor ? { shapedFor: s.shapedFor } : {}),
    sends: [...(was.sends || []), { at: s.at, via: s.via, tierId: s.tierId, validUntil: until.getTime(), ...(s.by ? { by: s.by } : {}) }],
  };
  return { ...prev, proposal };
}

/** The version the client was sent, if any: it is kept as it went, and changes go in a new version. */
export const sentProposalTier = (ctx: Pick<ProjectContext, 'proposal'> | null | undefined): string | null =>
  (ctx?.proposal?.issuedAt && ctx.proposal.tierId) || null;

/** "Palacia – 3BHK · First proposal · 20 Nov 2026.pdf" */
export function proposalFileName(project: string, at: Date): string {
  const d = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${(project || 'Proposal').replace(/[\\/:*?"<>|]/g, '-')} · First proposal · ${d}.pdf`;
}

/** The rooms the plan page lists: every real room, with its size from the brief. */
export const homeRooms = (rooms: Room[]) => realRooms(rooms).map(r => ({ name: r.name, size: roomSize(r) }));

/* ───────────────────────────── the Client Proposal's material specifications ───────────────────────────── */

export interface SpecCell { mat: string; words: string; brand: string; versions: number[]; current: number; lines: number; /** A finish's colour, for its swatch. */ swatch?: string }
export interface SpecTable {
  grades: { grade: Grade; name: string; fromBoq: boolean }[];
  rows: { fam: string; name: string; cells: SpecCell[][] }[];
  /** Lines of the option on an older version of a material than the bank's. */
  stale: number;
}

/**
 * The material specifications, built from the BOQ (the mockup's Client
 * Proposal, section 4): for the option's own grade, the materials its lines
 * use, with the versions they are on; for the other grades, the materials the
 * same items' recipes would give. Lines with their own words have no materials
 * and are left out, as are items with no recipe.
 */
export function specTable(bank: MaterialSpecsBank | null | undefined, tier: Pick<ProposalTier, 'boq' | 'name' | 'specGrade'>, bankMap: Map<string, Item>, names: Partial<Record<Grade, string>> = {}): SpecTable | null {
  if (!bank) return null;
  const own = gradeOf(tier);
  const lines = (tier.boq || []).filter(l => LIVE(l) && resolveBoqLine(l, bankMap).billable);
  const GR: Grade[] = ['E', 'C', 'P'];
  const forGrade = (g: Grade, fam: string): SpecCell[] => {
    const used = new Map<string, SpecCell>();
    lines.forEach(l => {
      const item = bankMap.get(l.bankId);
      const recipe = item ? recipeOf(item, bank) : null;
      if (!recipe) return;
      const specs = g === own ? l.materialSpecs : specsFromRecipe(bank, recipe, g);
      Object.values(specs || {}).forEach(s => {
        const m = bank.materials.find(x => x.id === s.id);
        if (!m || m.fam !== fam) return;
        const cur = currentVersion(bank, m.id)?.v || s.v;
        const e = used.get(m.id) || { mat: m.id, words: '', brand: currentVersion(bank, m.id)?.brand || '', versions: [], current: cur, lines: 0, ...(m.base ? { swatch: m.base } : {}) };
        e.lines++;
        if (!e.versions.includes(s.v)) e.versions.push(s.v);
        used.set(m.id, e);
      });
    });
    return [...used.values()].map(e => {
      e.versions.sort((a, b) => a - b);
      const h = versionAt(bank, e.mat, e.versions[e.versions.length - 1]);
      return { ...e, words: cap(h?.words || '') };
    }).sort((a, b) => b.lines - a.lines);
  };
  const rows = bank.families.map(f => ({ fam: f.id, name: f.name, cells: GR.map(g => forGrade(g, f.id)) })).filter(r => r.cells.some(c => c.length));
  return {
    grades: GR.map(g => ({ grade: g, name: names[g] || GRADE_TIER[g], fromBoq: g === own })),
    rows,
    stale: lines.filter(l => staleParts(bank, l).length > 0).length,
  };
}
