import { Item, ProjectContext } from '../types';
import { resolveBoqLine, isBillable } from './boqPricing';

/**
 * THE DETAILED BOQ — the scope as a document the client can read, sign and keep.
 *
 * Until this existed the client never held their scope as a document. They
 * approved a proposal, and the BOQ lived on as rows in the app: priced by
 * whatever the rate bank said that day, renamed whenever a room was renamed,
 * and handed to the Execution Agreement as raw tier data that rendered every
 * line at ₹0.
 *
 * A Detailed BOQ is frozen at issue. Every figure in it is the figure the
 * studio's own pricing produced at that moment (`resolveBoqLine`, the same
 * function behind every total in the app), carried as a plain number. Nothing
 * that explains how the price was reached — materials, labour, margin, bank
 * ids, internal specs — leaves this file.
 *
 * Rates are net: whatever commercial terms the project carries are already
 * inside them, which is how the studio has always quoted.
 */

export interface DetailedBoqLine {
  /** Stable across versions: the tier line id. */
  id: string;
  name: string;
  /** Client-facing description, or absent. Never an internal spec. */
  description?: string;
  unit: string;
  qty: number;
  /** Net sell rate per unit. */
  rate: number;
  amount: number;
  asActuals?: boolean;
  inclusions?: string[];
  exclusions?: string[];
}

export interface DetailedBoqRoom {
  name: string;
  /** The room's name in the previous version, when it was renamed. */
  formerly?: string;
  lines: DetailedBoqLine[];
  total: number;
}

export interface DetailedBoqSnapshot {
  schema: 1;
  version: number;
  reference: string;
  clientName: string;
  projectName: string;
  location?: string;
  org: { orgName?: string | null; officeAddress?: string | null; contactEmail?: string | null };
  issuedOn: number;
  /** How this version became the scope. */
  approval:
    | { mode: 'for_signature' }
    | { mode: 'recorded'; approvedOn: number; note: string }
    | { mode: 'via_revision'; revisionReference: string };
  rooms: DetailedBoqRoom[];
  /** Held in the studio's working BOQ, but not part of this scope. */
  notInScope: { name: string; room: string; reason: string }[];
  total: number;
  lineCount: number;
  /** The version this one replaces, for the heading line. */
  replaces?: { reference: string; total: number } | null;
  /** Which tier it was built from — studio bookkeeping, not rendered. */
  tierId: string;
}

// ---------------------------------------------------------------------------
// Presentation helpers, shared with the Scope Revision
// ---------------------------------------------------------------------------

/** What imports and templates write when they have no description to give. */
const PLACEHOLDER = /^(imported( via excel| from excel| boq)?[.:]?|custom( \/)? (old|legacy) item|custom item|deliverable item|unnamed item|item|details missing from bank)$/i;

export const isPlaceholderText = (s: unknown): boolean =>
  typeof s !== 'string' || !s.trim() || PLACEHOLDER.test(s.trim());

/**
 * One spelling per unit. The same BOQ arrives as "SQFT.", "sq ft", "Sqft" and
 * "SFT" depending on who typed the line; a client reading four spellings of one
 * unit reasonably wonders whether they are four units.
 */
export function normaliseUnit(u: unknown): string {
  const raw = String(u ?? '').trim();
  const t = raw.toLowerCase().replace(/[.\s']/g, '');
  if (!t) return 'nos';
  if (['sqft', 'sft', 'sqfeet', 'sqfeets', 'squarefeet', 'sf'].includes(t)) return 'sq ft';
  if (['rft', 'rf', 'runningfeet', 'rft(runningfeet)', 'rmt'].includes(t)) return t === 'rmt' ? 'r m' : 'r ft';
  if (['no', 'nos', 'nos)', 'number', 'numbers', 'pcs', 'pc', 'each', 'ea', 'unit', 'units', "no's", 'nos.'].includes(t)) return 'nos';
  if (['ls', 'lumpsum', 'lumpsump', 'lump', 'job', 'lot'].includes(t)) return 'lump sum';
  if (['sqm', 'sqmt', 'm2'].includes(t)) return 'sq m';
  if (['point', 'points', 'pt', 'pts'].includes(t)) return 'points';
  return raw.toLowerCase();
}

/**
 * Item names as the client should read them.
 *
 * Imported sheets arrive in capitals ("WARDOBE WITH LOFT"). Capitals are left
 * alone when the name mixes cases on purpose; an all-capitals name is set in
 * sentence case, keeping short tokens that are genuinely acronyms (TV, POP).
 */
const KEEP_UPPER = new Set(['TV', 'POP', 'AC', 'MS', 'SS', 'PVC', 'UPVC', 'LED', 'MDF', 'HDHMR', 'BWP', 'BWR', 'WPC', 'DB', 'MCB', 'CP', 'WC', 'GI', 'PU', 'BHK']);
export function displayName(name: unknown): string {
  const raw = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Item';
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return raw;
  const words = raw.toLowerCase().split(' ');
  return words
    .map((w, i) => {
      const bare = w.replace(/[^a-z.]/g, '').replace(/\./g, '').toUpperCase();
      if (KEEP_UPPER.has(bare)) return w.toUpperCase().replace(/\./g, '');
      return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    })
    .join(' ');
}

const toList = (v: any): string[] | undefined => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;,]\s*/) : [];
  const out = raw.map((s: any) => String(s).trim()).filter(Boolean);
  return out.length ? out : undefined;
};

/** A client-facing description, or undefined. Internal specs are never read. */
export function clientDescription(line: any, bankItem?: Item): string | undefined {
  for (const c of [line?.description, line?.specs, bankItem?.specs, line?.commercialNote]) {
    if (!isPlaceholderText(c)) return String(c).trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** "Unique Vistas" -> "UV"; "Test Project for T&C" -> "TPFT". */
export function projectCode(name: string | undefined): string {
  const words = String(name || 'Project').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const code = words.map(w => w[0]).join('').toUpperCase();
  return (code || 'P').slice(0, 5);
}

/** The studio's document prefix, the same one the other releases use. */
export function referencePrefix(context: ProjectContext): string {
  const ctx = context as any;
  const configured =
    ctx.engagement?.lockedSnapshot?.termsSettings?.docketRefPrefix ||
    (context.termsDockets || []).slice(-1)[0]?.snapshotTermsConfig?.docketRefPrefix ||
    'FFDS';
  return String(configured).replace(/-(TD|PS|EA|OK|HD|VO)$/i, '');
}

export function detailedBoqReference(context: ProjectContext, version: number, year = new Date().getFullYear()): string {
  return `${referencePrefix(context)}-BQ-${year}-${projectCode(context.name)}-v${version}`;
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export interface BuildDetailedBoqInput {
  context: ProjectContext;
  tier: { id: string; boq: any[] };
  bankMap: Map<string, Item>;
  version: number;
  reference: string;
  approval: DetailedBoqSnapshot['approval'];
  org?: DetailedBoqSnapshot['org'];
  /** Room renames to show as "formerly": v2 room -> v1 room. */
  formerly?: Record<string, string>;
  replaces?: DetailedBoqSnapshot['replaces'];
  issuedOn?: number;
}

const REASON: Record<string, string> = {
  deleted: 'Deleted',
  substituted: 'Substituted',
  excluded: 'Excluded',
  client_procured: 'Client procured',
};

export function buildDetailedBoqSnapshot(input: BuildDetailedBoqInput): DetailedBoqSnapshot {
  const { context, tier, bankMap } = input;
  const rooms: DetailedBoqRoom[] = [];
  const byRoom = new Map<string, DetailedBoqRoom>();
  const notInScope: DetailedBoqSnapshot['notInScope'] = [];

  (tier.boq || []).forEach((b: any, idx: number) => {
    const resolved = resolveBoqLine(b, bankMap);
    const name = displayName(resolved.name);
    if (!isBillable(b)) {
      notInScope.push({ name, room: resolved.room, reason: REASON[b.boqStatus] || 'Not in scope' });
      return;
    }
    if (!(resolved.qty > 0)) {
      notInScope.push({ name, room: resolved.room, reason: b.heldReason || 'At zero quantity' });
      return;
    }
    let room = byRoom.get(resolved.room);
    if (!room) {
      room = { name: resolved.room, lines: [], total: 0 };
      if (input.formerly?.[resolved.room] && input.formerly[resolved.room] !== resolved.room) {
        room.formerly = input.formerly[resolved.room];
      }
      byRoom.set(resolved.room, room);
      rooms.push(room);
    }
    const bankItem = bankMap.get(b.bankId);
    room.lines.push({
      id: String(b.id || `line-${idx}`),
      name,
      description: clientDescription(b, bankItem),
      unit: normaliseUnit(resolved.unit),
      qty: resolved.qty,
      rate: resolved.rate,
      amount: resolved.total,
      asActuals: b.boqStatus === 'as_actuals' || b.asActuals === true || /as\s*actuals?/i.test(resolved.name) || undefined,
      inclusions: toList(b.inclusions ?? (bankItem as any)?.inclusions),
      exclusions: toList(b.exclusions ?? (bankItem as any)?.exclusions),
    });
    room.total += resolved.total;
  });

  const total = rooms.reduce((s, r) => s + r.total, 0);
  const org = input.org || {};
  return JSON.parse(JSON.stringify({
    schema: 1,
    version: input.version,
    reference: input.reference,
    clientName: context.clientName || 'Client',
    projectName: context.name,
    location: context.location,
    org: { orgName: org.orgName || null, officeAddress: org.officeAddress || null, contactEmail: org.contactEmail || null },
    issuedOn: input.issuedOn || Date.now(),
    approval: input.approval,
    rooms,
    notInScope,
    total,
    lineCount: rooms.reduce((s, r) => s + r.lines.length, 0),
    replaces: input.replaces || null,
    tierId: tier.id,
  } as DetailedBoqSnapshot));
}

// ---------------------------------------------------------------------------
// Before recording
// ---------------------------------------------------------------------------

export interface RecordCheck {
  level: 'block' | 'warn';
  /** Warnings the studio must tick before recording anyway. */
  confirm?: boolean;
  text: string;
}

const LUMP = new Set(['lump sum', 'nos', 'points']);

/**
 * What would make this BOQ a bad document to freeze, found across the studio's
 * projects: lines whose bank item is gone (printed as "Item" at ₹0), a single
 * mistyped quantity pricing one line in crores, and a version whose price has
 * drifted with the rate bank since it was approved.
 */
export function recordReadiness(boq: any[], bankMap: Map<string, Item>, approvedValue?: number | null): RecordCheck[] {
  const out: RecordCheck[] = [];
  const lines = (boq || [])
    .filter(b => isBillable(b))
    .map(b => ({ b, r: resolveBoqLine(b, bankMap) }))
    .filter(x => x.r.qty > 0);
  const total = lines.reduce((s, x) => s + x.r.total, 0);

  const nameless = lines.filter(x => isPlaceholderText(x.r.name) || /^unnamed item$/i.test(x.r.name));
  const unpriced = lines.filter(x => !(x.r.rate > 0));
  if (nameless.length || unpriced.length) {
    const n = new Set([...nameless, ...unpriced]).size;
    out.push({
      level: 'block',
      text: `${n} line${n === 1 ? ' has' : 's have'} no name or no rate — usually a rate-bank item that has since been deleted — and would print as “Item” at ₹0. Fix ${n === 1 ? 'it' : 'them'} in the BOQ Editor first.`,
    });
  }

  lines.forEach(({ r }) => {
    const unit = normaliseUnit(r.unit);
    if (total > 0 && r.total > total * 0.4 && lines.length > 3) {
      out.push({ level: 'warn', confirm: true, text: `“${displayName(r.name)}” is ${Math.round((r.total / total) * 100)}% of the whole BOQ (${r.qty} × ₹${Math.round(r.rate).toLocaleString('en-IN')}). Check its quantity.` });
    } else if (LUMP.has(unit) && r.qty > 100 && r.rate > 1000) {
      out.push({ level: 'warn', confirm: true, text: `“${displayName(r.name)}” is ${r.qty} ${unit} at ₹${Math.round(r.rate).toLocaleString('en-IN')}. That looks like an amount typed into the quantity.` });
    }
  });

  if (approvedValue && Math.abs(approvedValue - total) > 1) {
    out.push({
      level: 'warn',
      confirm: true,
      text: `The approved value on record is ₹${Math.round(approvedValue).toLocaleString('en-IN')}, but today's rates price this version at ₹${Math.round(total).toLocaleString('en-IN')} — the rate bank has moved since it was approved. Recording freezes today's price; the bank keeps no history to go back to.`,
    });
  }
  // The same line twice in a BOQ gives the same warning twice; say it once.
  return out.filter((c, i) => out.findIndex(x => x.text === c.text) === i);
}

// ---------------------------------------------------------------------------
// Freezing
// ---------------------------------------------------------------------------

/**
 * Pin every bank-priced line to the rates it carries today.
 *
 * Labour, materials and margin were read live from the rate bank on every
 * render, so editing the bank quietly re-priced a BOQ the client had already
 * approved. Freezing copies the three bank values onto the line itself, into
 * the fields every pricing path in the app already honours first (`baseRate`,
 * `labor`, `marginOverride`) — so no screen needs to learn a new field, and
 * the rate cannot move by construction: it is the same three numbers.
 *
 * Values the line already overrides are kept. Lines that are not in the bank
 * price from their own fields and are already fixed.
 */
export function freezeBoqLines(boq: any[], bankMap: Map<string, Item>, at = Date.now()): any[] {
  return (boq || []).map(b => {
    const item = bankMap.get(b.bankId);
    if (!item) return b;
    return {
      ...b,
      baseRate: b.baseRate !== undefined ? b.baseRate : item.materials,
      labor: b.labor !== undefined ? b.labor : item.labor,
      marginOverride: b.marginOverride !== undefined && b.marginOverride !== null ? b.marginOverride : item.margin,
      rateSnapshotAt: b.rateSnapshotAt || at,
    };
  });
}

/** True once every bank-priced line carries its own rates. */
export function isFrozen(boq: any[], bankMap: Map<string, Item>): boolean {
  return (boq || []).every(b => {
    if (!bankMap.get(b.bankId)) return true;
    return b.baseRate !== undefined && b.labor !== undefined && b.marginOverride !== undefined && b.marginOverride !== null;
  });
}

/**
 * The parity check: the largest difference, line by line, between two pricings
 * of what should be the same BOQ. Freezing must return 0.
 */
export function pricingDrift(before: any[], after: any[], bankMap: Map<string, Item>): { maxLine: number; total: number } {
  let maxLine = 0;
  let a = 0;
  let b = 0;
  (before || []).forEach((line, i) => {
    const x = resolveBoqLine(line, bankMap);
    const y = resolveBoqLine((after || [])[i], bankMap);
    if (x.billable) a += x.total;
    if (y.billable) b += y.total;
    maxLine = Math.max(maxLine, Math.abs(x.total - y.total));
  });
  return { maxLine, total: Math.abs(a - b) };
}
