import { ProjectContext } from '../types';
import { DetailedBoqSnapshot, displayName, referencePrefix, projectCode } from './detailedBoq';
import { RevisionResult, LineKind, RevisionSettings, SignedLine, HELD_REASON } from './scopeRevision';

/**
 * THE SCOPE REVISION DOCUMENT — what the client reads and signs.
 *
 * Frozen from a computed revision at the moment it is issued. It carries the
 * whole revised Detailed BOQ as its attachment, so signing it is signing the
 * new scope: there is no second document to sign, and no way for the two to
 * disagree. Like the Detailed BOQ it holds figures only — no costs, margins,
 * bank ids or internal notes.
 */

export type ChangeTag = 'NEW' | 'SIZE' | 'RATE' | 'SIZE + RATE' | 'REDESIGNED' | 'REMOVED';

export interface ScopeChangeLine {
  name: string;
  tag: ChangeTag;
  /** Both names, for a redesign or a rename. */
  was?: string;
  now?: string;
  q1?: number;
  q2?: number;
  unit?: string;
  a1: number;
  a2: number;
  change: number;
}

export interface ScopeChangeRoom {
  name: string;
  formerly?: string;
  isNew: boolean;
  /** Compared as a section total rather than line by line. */
  asSection?: { caveat: string; before: { name: string; amount: number }[]; after: { name: string; amount: number }[] };
  lines: ScopeChangeLine[];
  v1: number;
  v2: number;
  change: number;
  note?: string;
}

export interface BridgePart {
  key: 'new' | 'qty' | 'redesign' | 'section' | 'removed' | 'rate';
  label: string;
  sub: string;
  value: number;
}

export interface ScopeRevisionSnapshot {
  schema: 1;
  number: number;
  reference: string;
  clientName: string;
  projectName: string;
  location?: string;
  org: DetailedBoqSnapshot['org'];
  issuedOn: number;
  issuedBy: string;
  summary: string;
  v1: { reference: string; total: number; approvedOn?: number | null; fingerprint?: string | null };
  /** The revised scope in full — this document's attachment. */
  v2: DetailedBoqSnapshot;
  change: number;
  bridge: BridgePart[];
  rooms: ScopeChangeRoom[];
  removedCount: number;
  removedValue: number;
  /** Revised lines outside the price — at zero, removed, to be confirmed, as actuals. */
  atZero: { name: string; room: string; reason?: string }[];
  designFeeNote: string;
}

export function scopeRevisionReference(context: ProjectContext, v1Reference: string, number: number): string {
  return v1Reference
    ? `${v1Reference}-REV-${String(number).padStart(2, '0')}`
    : `${referencePrefix(context)}-SR-${new Date().getFullYear()}-${projectCode(context.name)}-${String(number).padStart(2, '0')}`;
}

const TAG: Record<LineKind, ChangeTag | null> = {
  same: null,
  qty: 'SIZE',
  rate: 'RATE',
  qty_rate: 'SIZE + RATE',
  redesign: 'REDESIGNED',
  new: 'NEW',
  removed: 'REMOVED',
};

export const BRIDGE_LABELS: Record<BridgePart['key'], [string, string]> = {
  new: ['New items', 'Not in the signed BOQ.'],
  qty: ['Larger or smaller quantities', 'The same items, measured again, at the signed rates.'],
  redesign: ['Redesigned items', 'Replaced by a different design. Both names are shown.'],
  section: ['Sections compared as a whole', 'Itemised differently in the revision, so compared as a section total.'],
  removed: ['Items removed', 'In the signed BOQ, not in the revision.'],
  rate: ['Unit-rate changes', 'The same items, priced differently, at the revised quantities.'],
};

export interface BuildScopeRevisionInput {
  context: ProjectContext;
  number: number;
  reference: string;
  result: RevisionResult;
  settings: RevisionSettings;
  v1: ScopeRevisionSnapshot['v1'];
  v2: DetailedBoqSnapshot;
  issuedBy: string;
  org?: DetailedBoqSnapshot['org'];
  /** The signed lines, for rooms compared as a whole. */
  signed: SignedLine[];
}

export function buildScopeRevisionSnapshot(input: BuildScopeRevisionInput): ScopeRevisionSnapshot {
  const { result, settings } = input;

  const rooms: ScopeChangeRoom[] = result.rooms.map(r => {
    const base: ScopeChangeRoom = {
      name: r.name,
      formerly: r.signedRoom && r.signedRoom !== r.name ? r.signedRoom : undefined,
      isNew: !r.signedRoom,
      lines: [],
      v1: r.before,
      v2: r.after,
      change: r.after - r.before,
      note: settings.roomNotes[r.name]?.trim() || undefined,
    };
    if (r.compareAsSection) {
      base.asSection = {
        caveat: settings.roomNotes[r.name]?.trim() ||
          'Itemised differently in the revision, so the section totals are compared rather than treating every revised line as new.',
        before: [],
        after: r.lines.map(l => ({ name: displayName(l.imported?.name), amount: l.amount2 })),
      };
      return base;
    }
    base.lines = r.lines
      .filter(l => TAG[l.kind])
      .map(l => {
        const a1 = l.signed?.amount || 0;
        const renamed = l.kind === 'redesign';
        return {
          name: displayName(l.imported?.name || l.signed?.name),
          tag: TAG[l.kind]!,
          was: renamed ? displayName(l.signed?.name) : undefined,
          now: renamed ? displayName(l.imported?.name) : undefined,
          q1: l.signed?.qty,
          q2: l.kind === 'removed' ? 0 : l.qty2,
          unit: l.imported?.unit || l.signed?.unit,
          a1,
          a2: l.amount2,
          change: l.amount2 - a1,
        };
      });
    return base;
  });

  // Section comparisons list what the signed version had in that room.
  result.rooms.forEach((r, i) => {
    if (!r.compareAsSection || !rooms[i].asSection || !r.signedRoom) return;
    rooms[i].asSection!.before = input.signed
      .filter(s => s.room === r.signedRoom)
      .map(s => ({ name: displayName(s.name), amount: s.amount }));
  });

  const bridge: BridgePart[] = (['new', 'qty', 'redesign', 'section', 'removed', 'rate'] as const)
    .map(key => ({ key, label: BRIDGE_LABELS[key][0], sub: BRIDGE_LABELS[key][1], value: result.bridge[key] }))
    .filter(p => Math.abs(p.value) >= 0.005);

  const removed = result.rooms.flatMap(r => (r.compareAsSection ? [] : r.lines)).filter(l => l.kind === 'removed');
  const designFeeType = input.context.designFeeType;
  const designFeeNote =
    designFeeType === 'fixed_lumpsum' || designFeeType === 'fixed_sqft'
      ? 'The design fee is fixed and does not change with this revision.'
      : 'This revision changes the execution scope only. The design fee is not revised by it.';

  return JSON.parse(JSON.stringify({
    schema: 1,
    number: input.number,
    reference: input.reference,
    clientName: input.context.clientName || 'Client',
    projectName: input.context.name,
    location: input.context.location,
    org: input.org || input.v2.org,
    issuedOn: Date.now(),
    issuedBy: input.issuedBy,
    summary: settings.summary.trim(),
    v1: input.v1,
    v2: input.v2,
    change: result.change,
    bridge,
    rooms,
    removedCount: removed.length,
    removedValue: removed.reduce((s, l) => s + (l.signed?.amount || 0), 0),
    atZero: result.zeroImported.map(l => ({ name: displayName(l.name), room: settings.roomNames[l.section] || l.section, reason: l.heldOut ? HELD_REASON[l.heldOut] : undefined })),
    designFeeNote,
  } as ScopeRevisionSnapshot));
}
