/*
  The meeting view (BOQ Playground PR P, as in the approved mockup): the
  proposal presented on screen once the layout is approved, rooms drawn.

  Before that, Present opens the first-proposal PDF: no drawing reaches the
  client until Space Planning Approved (the drawing gate). In the meeting the
  client may ask for another finish on a piece; each ask is priced as the line
  would be, and the asks become the option's next version.
*/
import type { BoqItem, Item, Room } from '../../types';
import { lineAmount, type LineAmountOptions } from './pricing';
import { withPart, recipeOf, finishPartOf } from '../lineSpecs';
import { currentVersion, type MaterialSpecsBank, type Material } from '../materialSpecs';
import { boardPieces } from './pieces';
import { realRooms } from '../scopeBuckets';

/* ───────────────────────────── where the client is ───────────────────────────── */

export interface Journey {
  /** The client has booked: paid the booking amount (the design fee's first stage). */
  booked: boolean;
  /** Space Planning Approved: drawings may reach the client. */
  layoutApproved: boolean;
}

/**
 * Where the client is, from the project's journey (services/journeyEngine):
 * the layout approved is the Space Planning Approved step done; booked is the
 * design fee received, or any later step done. Without a journey, neither.
 */
export function journeyOf(steps: { id: string; status: string }[] | null | undefined): Journey {
  const done = new Set((steps || []).filter(s => s.status === 'done').map(s => s.id));
  const layoutApproved = done.has('space_planning_approved') || done.has('design_approved');
  return { layoutApproved, booked: done.has('design_fee_received') || done.has('agreement_signed') || layoutApproved };
}

/* ───────────────────────────── a finish the client asks for ───────────────────────────── */

export interface FinishChoice {
  part: string;
  /** The material the line has now. */
  current: string;
  /** The finishes it may have instead: the materials of the same family. */
  options: Material[];
}

/** The outer finish a line can be shown in other finishes of, or null. */
export function finishChoice(bank: MaterialSpecsBank | null | undefined, line: BoqItem, item: Item | undefined): FinishChoice | null {
  if (!bank || !item || !line.materialSpecs) return null;
  const part = finishPartOf(recipeOf(item, bank));
  const cur = part && line.materialSpecs[part.part];
  if (!part || !cur) return null;
  const fam = bank.materials.find(m => m.id === cur.id)?.fam || part.fam;
  const options = bank.materials.filter(m => m.fam === fam && currentVersion(bank, m.id));
  return options.length > 1 ? { part: part.part, current: cur.id, options } : null;
}

/** line id → the material the client asked for. */
export type Asks = Record<string, string>;

/** The line as the client asked for it: its finish changed, priced and worded from the material. */
export function askedLine(bank: MaterialSpecsBank | null | undefined, line: BoqItem, item: Item | undefined, asks: Asks): BoqItem {
  const mat = asks[String(line.id)];
  const c = mat && finishChoice(bank, line, item);
  return c && mat !== c.current ? withPart(bank!, line, item, c.part, mat) : line;
}

/** The BOQ with every ask made: what the next version starts from. */
export const withAsks = (boq: BoqItem[], asks: Asks, bank: MaterialSpecsBank | null | undefined, bankMap: Map<string, Item>): BoqItem[] =>
  boq.map(l => askedLine(bank, l, bankMap.get(l.bankId), asks));

/** What the asks change the work by, priced as each line is (rounded for a Playground version). */
export function askDelta(boq: BoqItem[], asks: Asks, bank: MaterialSpecsBank | null | undefined, bankMap: Map<string, Item>, pricing: LineAmountOptions | null): number {
  let d = 0;
  boq.forEach(l => {
    if (!asks[String(l.id)]) return;
    const a = askedLine(bank, l, bankMap.get(l.bankId), asks);
    if (a !== l) d += lineAmount(a, bankMap, pricing || {}) - lineAmount(l, bankMap, pricing || {});
  });
  return d;
}

/* ───────────────────────────── the chapters ───────────────────────────── */

export interface Chapter { key: string; title: string; room?: string }

/** Welcome, Your home, a chapter per room with something in it, Materials, Your options, Investment, Next step. */
export function chaptersOf(rooms: Room[], boq: BoqItem[], options: number): Chapter[] {
  const used = new Set(boq.map(l => l.roomId));
  return [
    { key: 'welcome', title: 'Welcome' },
    { key: 'home', title: 'Your home' },
    ...realRooms(rooms).filter(r => used.has(r.name)).map(r => ({ key: `room:${r.name}`, title: r.name, room: r.name })),
    { key: 'materials', title: 'Materials' },
    ...(options > 1 ? [{ key: 'options', title: 'Your options' }] : []),
    { key: 'invest', title: 'Investment' },
    { key: 'next', title: 'Next step' },
  ];
}

/** The pieces drawn in a room (or the whole flat), the high ones last so they sit on top. */
export function piecesIn(boq: BoqItem[], bankMap: Map<string, Item>, room?: string) {
  return boardPieces(boq, bankMap).filter(p => !room || p.room === room).sort((a, b) => Number(a.draw.mount === 'high') - Number(b.draw.mount === 'high'));
}
