import React from 'react';
import type { PlanSheet } from '../../types';
import { isPdfSheet } from '../../lib/playground/planSheet';

/*
  The line plan: the client's plan redrawn as the approved mockup draws a plan.

  A builder's plan often comes rendered, with furniture, beds, tiles and
  flooring drawn in. The studio's own pieces go on top of it, so the client's
  drawing is not shown under the BOQ by default: each room read off it is drawn
  on paper (#f7f6f2) inside near-black walls, as in the mockup. The rooms were
  traced on the inside face of the walls, so a wall is drawn around each room,
  WALL_FT out from it: two rooms either side of a 9″ wall meet in one solid wall.
  The drawing can still be shown under the rooms in the Plan lens, to check them.
*/

/** How far a wall reaches out of a room, in feet: 4½″, half a 9″ wall. */
export const WALL_FT = 0.375;
const WALL = '#262626';
const PAPER = '#f7f6f2';

/** A plan sheet whose drawing can be shown under the rooms: an image with its scale set. */
export const drawingOf = (sheet: PlanSheet | null | undefined): PlanSheet | null =>
  sheet?.imageUrl && Number(sheet.ftPerPx) > 0 && sheet.imagePx && !isPdfSheet(sheet) ? sheet : null;

/** The walls, then the rooms' paper over them; anything drawn after sits on the paper. */
export function LinePlanRooms({ rooms }: { rooms: { name: string; plan?: { x: number; y: number; w: number; h: number } }[] }) {
  const rs = rooms.filter(r => r.plan);
  return (
    <g pointerEvents="none" data-line-plan>
      {rs.map(r => (
        <rect key={`wall-${r.name}`} x={r.plan!.x - WALL_FT} y={r.plan!.y - WALL_FT} width={r.plan!.w + 2 * WALL_FT} height={r.plan!.h + 2 * WALL_FT} fill={WALL} />
      ))}
      {rs.map(r => (
        <rect key={`paper-${r.name}`} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill={PAPER} />
      ))}
    </g>
  );
}
