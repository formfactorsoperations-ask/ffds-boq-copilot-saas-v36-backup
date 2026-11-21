/**
 * BOQ Playground — the quick build, filled from the studio's Standard templates.
 *
 * One route writes a BOQ: the Standard templates (lib/standardPackages
 * generateStandardPackages), which the setup wizard and Regenerate already use.
 * The quick build used to keep a list of its own (room standards), so the same
 * flat got 8 lines here and 33 from the wizard. It now asks the same generator
 * for the option at the chosen grade, on the rooms it has just drawn, and keeps
 * the lines the BOQ does not have yet. Pieces land on the plan or wait under
 * Needs a place.
 *
 * A studio whose templates name no item in its Item Bank gets nothing here; the
 * caller falls back to the room standards so the quick build is never empty.
 *
 * Pure.
 */
import type { BoqItem, Item, ProjectContext, Room } from '../../types';
import type { Grade } from '../materialSpecs';
import { generateStandardPackages, type TemplateData } from '../standardPackages';
import { realRooms } from '../scopeBuckets';
import { placeWaitingLines } from './placeAll';
import { needsPlace } from './board';
import type { QuickLines } from './quickBuild';

const GRADE_INDEX: Record<Grade, number> = { E: 0, C: 1, P: 2 };

export function templateLines(args: {
  ctx: ProjectContext;
  /** The rooms on the plan, as the quick build drew them. */
  rooms: Room[];
  bank: Item[];
  templates?: TemplateData | null;
  grade: Grade;
  /** The option's lines already there: a room that has an item is not given it again. */
  boq?: BoqItem[];
  newId: () => string;
}): QuickLines | null {
  const { ctx, rooms, bank, templates, grade, newId } = args;
  if (!templates || !rooms.length) return null;
  const real = realRooms(rooms);
  const area = real.reduce((a, r) => a + (Number(r.size) || 0), 0);
  const tiers = generateStandardPackages({ ...ctx, rooms: real, area: Number(ctx.area) > 0 ? ctx.area : area }, bank, templates, 'tiered');
  const tier = tiers[GRADE_INDEX[grade]] || tiers[1] || tiers[0];
  if (!tier?.boq?.length) return null;
  const have = new Set((args.boq || []).map(l => `${l.bankId}@${l.roomId}`));
  const fresh = tier.boq.filter(l => !have.has(`${l.bankId}@${l.roomId}`)).map(l => ({ ...l, id: newId() }));
  if (!fresh.length) return null;
  const bankMap = new Map(bank.map(i => [i.id, i]));
  /* Placed against what the option already has; the new lines are the tail, in order. */
  const lines = placeWaitingLines([...(args.boq || []), ...fresh], rooms, bankMap).boq.slice(-fresh.length);
  const waiting = needsPlace(lines, bankMap).map(l => `${bankMap.get(l.bankId)?.name || 'Item'} in ${l.roomId}`);
  return { lines, placed: lines.filter(l => l.place).length, waiting, missing: [] };
}
