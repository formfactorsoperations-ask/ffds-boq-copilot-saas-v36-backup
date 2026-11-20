/*
  The rooms off the client's floor plan.

  The setup wizard's "Analyse the plan", moved here so Brief & Site's read
  view (components/brief/BriefReadView) does the same reading: the AI reads
  the rooms and their sizes off the drawing, the typology tops up any it did
  not find, the plan sets the configuration and the area, and the rooms are
  named the way a studio names them. Behaviour is unchanged from the wizard.
*/
import type { PlanSheet, ProjectContext, Room } from '../types';
import { analyzeFloorPlan, estimateRoomSizes, isAiAvailable, readPlanBoxes } from './geminiService';
import { scaleFromBoxes, rectsFromBoxes, withRect } from '../lib/playground/planSheet';
import { imageSizeOf, storePlanImage } from './planImage';
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

export interface PlanOnSheet extends PlanRooms {
  /**
   * The client's plan as the BOQ Playground draws it: the image, its size and
   * its scale, with each room read off it placed where it is drawn. Null when
   * no room on the plan has its size printed, so the scale is not known.
   */
  sheet: PlanSheet | null;
  /** Rooms put on the plan. */
  onPlan: number;
}

const dataUrlOf = (b64: string) => `data:${b64.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg'};base64,${b64}`;

/**
 * Read the plan, and put it under the BOQ.
 *
 * One reading gives both the rooms and where each is drawn (readPlanBoxes).
 * The scale comes from the rooms whose size is printed, as the Playground's
 * own "Read rooms off the plan" works it out, so the BOQ Editor opens on the
 * client's plan with the rooms on it rather than on blocks.
 *
 * `image` is what the AI reads: the plan image, or page 1 of a PDF drawn as
 * one. `imageUrl` is that same image in Storage when there is one (a plan
 * uploaded as an image); for a PDF the drawn page is stored here, since the
 * Playground draws an image, not a PDF.
 */
export async function readPlanOntoSheet(image: string, ctx: Partial<ProjectContext>, opts: { tenantId?: string; imageUrl?: string | null }): Promise<PlanOnSheet> {
  const { rooms: detected, boxes } = await readPlanBoxes(image, Number(ctx.area) || 0);
  const total = detected.reduce((sum, r) => sum + (r.size || 0), 0);
  const area = total > 0 ? Number(total.toFixed(2)) : Number(ctx.area) || 0;

  let sheet: PlanSheet | null = null;
  let withPlans: Room[] = detected;
  let onPlan = 0;
  const imagePx = await imageSizeOf(dataUrlOf(image)).catch(() => null);
  const k = imagePx ? scaleFromBoxes(boxes, imagePx) : null;
  if (imagePx && k) {
    /*
      Rooms and boxes come back as two lists from one reading, each in the
      drawing's order but filtered differently, so a box is matched to its room
      by the label on the plan, in order: the second "Toilet" box is the second
      "Toilet" room. Before the names are polished, while they still match.
    */
    const rects = rectsFromBoxes(boxes, imagePx, k);
    const used = new Set<number>();
    withPlans = detected.map(r => {
      const i = rects.findIndex((x, j) => !used.has(j) && x.name === r.name);
      if (i < 0) return r;
      used.add(i);
      onPlan++;
      // A printed size is kept; the drawing gives the room its place.
      return r.dimSource === 'read' ? { ...r, plan: rects[i].plan } : withRect(r, rects[i].plan);
    });
    const imageUrl = opts.imageUrl || (await storePlanImage(opts.tenantId, image)).imageUrl;
    sheet = { source: 'brief', imageUrl, imagePx, ftPerPx: k, page: 1, readAt: Date.now() };
  }

  const mapped = await autoMapMissingRooms(withPlans, area, ctx);
  return {
    rooms: ensureScopeRooms(polishRoomNames(mapped, roomFamily)),
    area,
    config: configFromRooms(mapped),
    read: detected.length,
    sheet,
    onPlan,
  };
}
