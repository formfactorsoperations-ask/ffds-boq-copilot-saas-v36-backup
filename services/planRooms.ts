/*
  The rooms off the client's floor plan.

  The setup wizard's "Analyse the plan", moved here so Brief & Site's read
  view (components/brief/BriefReadView) does the same reading: the AI reads
  the rooms and their sizes off the drawing, the typology tops up any it did
  not find, the plan sets the configuration and the area, and the rooms are
  named the way a studio names them. Behaviour is unchanged from the wizard.
*/
import type { ProjectContext, Room } from '../types';
import { analyzeFloorPlan, estimateRoomSizes, isAiAvailable } from './geminiService';
import { resolveActiveTemplate, ensureRoomsExistForTemplate, detectRoomType, roomFamily } from '../lib/standardPackages';
import { ensureScopeRooms, polishRoomNames } from '../lib/scopeBuckets';

/**
 * The BHK the plan actually shows.
 *
 * The studio was typing this in after the AI had just counted the bedrooms
 * for them, and a wrong or empty config silently changes everything
 * downstream — it picks the template, the room distribution, and therefore
 * every quantity in the BOQ. Bedrooms are counted by room type rather than by
 * name, so "Bed 1" and "Master Bedroom" both count once.
 *
 * Returns null when the plan yielded no bedrooms at all; a guess would be
 * worse than leaving the field for a human.
 */
export function configFromRooms(rooms: Room[]): string | null {
  const bedrooms = rooms.filter(r => detectRoomType(r.name).includes('bedroom')).length;
  if (bedrooms < 1) return null;
  return `${Math.min(bedrooms, 4)}-BHK`;
}

/**
 * Top up a plan-derived room list with whatever the typology expects.
 *
 * Matched on room FAMILY rather than exact type: a plan labels its rooms
 * "Bedroom" and "Toilet", the typology calls the same rooms "Master Bedroom"
 * and "Common Bathroom", and matching on the exact type added a second set of
 * rooms with no dimensions, inflating the flat. Detected rooms come first, in
 * the order the plan gave them, and are never overwritten.
 */
export async function autoMapMissingRooms(detected: Room[], area: number, ctx: Partial<ProjectContext>): Promise<Room[]> {
  const config = ctx.config;
  if (!config || !area) return detected;

  let expected: Room[] = [];
  try {
    if (isAiAvailable() && detected.length === 0) expected = await estimateRoomSizes(area, config);
  } catch { /* falls through to the distribution below */ }

  if (expected.length === 0) {
    const { activeTemplate, configKey } = resolveActiveTemplate(undefined, config);
    expected = ensureRoomsExistForTemplate({ ...ctx, rooms: [], area } as any, activeTemplate, configKey);
  }

  if (detected.length === 0) return expected;

  const seen = new Map<string, number>();
  detected.forEach(r => {
    const k = roomFamily(r.name);
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  const additions: Room[] = [];
  expected.forEach(r => {
    const k = roomFamily(r.name);
    const remaining = seen.get(k) || 0;
    if (remaining > 0) { seen.set(k, remaining - 1); return; }
    additions.push(r);
  });
  return [...detected, ...additions];
}

export interface PlanRooms {
  rooms: Room[];
  area: number;
  /** The BHK the plan shows, or null when it showed no bedrooms. */
  config: string | null;
  /** How many rooms the drawing itself gave, before the typology topped it up. */
  read: number;
}

/**
 * Read the plan: the rooms, the area they add up to, and the configuration.
 *
 * The plan sets the configuration outright when it shows bedrooms (a new
 * project is created as 2-BHK, so "fill only if empty" never fired), and the
 * area when the rooms add up to one. Names are polished here, once: the name
 * is the identity a BOQ line carries, so polishing it later would orphan
 * every line already priced against the old name.
 */
export async function readRoomsFromPlan(planBase64: string, ctx: Partial<ProjectContext>): Promise<PlanRooms> {
  const detected = await analyzeFloorPlan(planBase64, Number(ctx.area) || 0);
  const total = detected.reduce((sum, r) => sum + (r.size || 0), 0);
  const area = total > 0 ? Number(total.toFixed(2)) : Number(ctx.area) || 0;
  const mapped = await autoMapMissingRooms(detected, area, ctx);
  return {
    rooms: ensureScopeRooms(polishRoomNames(mapped, roomFamily)),
    area,
    config: configFromRooms(mapped),
    read: detected.length,
  };
}
