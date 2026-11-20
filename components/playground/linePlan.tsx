import React from 'react';
import type { PlanSheet, RoomOpening } from '../../types';
import { isPdfSheet } from '../../lib/playground/planSheet';

/*
  The line plan: the client's plan redrawn as the approved mockup draws a plan.

  A builder's plan often comes rendered, with furniture, beds, tiles and
  flooring drawn in. The studio's own pieces go on top of it, so the client's
  drawing is not shown under the BOQ by default. The rooms read off it are
  made into a clean plan (lib/playground/planFromDrawing): each room's edges
  sit on its walls' centre lines, and rooms either side of a wall share the
  line. So here every wall is drawn about that line: a room's dark fill reaches
  OUT_FT past its edges and its paper (#f7f6f2) stops IN_FT short of them.
  Inside the flat two rooms meet in one wall 2 × IN_FT thick; the outside wall
  is OUT_FT + IN_FT, heavier, as the mockup draws it. Doors are a gap with the
  leaf and its swing; windows a gap with the glazing's two lines.
  The drawing can still be shown under the rooms in the Plan lens, to check them.
*/

/** How far a wall reaches out past a room's edge, ft: the outside wall is this plus IN_FT. */
export const OUT_FT = 0.375;
/** How far a room's floor stops short of its edge, ft: an inside wall is twice this, 4½″. */
export const IN_FT = 0.1875;
const WALL = '#262626';
const PAPER = '#f7f6f2';
const LINE = 0.06;

/** A plan sheet whose drawing can be shown under the rooms: an image with its scale set. */
export const drawingOf = (sheet: PlanSheet | null | undefined): PlanSheet | null =>
  sheet?.imageUrl && Number(sheet.ftPerPx) > 0 && sheet.imagePx && !isPdfSheet(sheet) ? sheet : null;

type Rect = { x: number; y: number; w: number; h: number };
interface LineRoom { name: string; plan?: Rect; openings?: RoomOpening[] }

/** A door or window drawn in a room's side: the wall cut, then the leaf and its swing, or the glazing. */
const Opening: React.FC<{ r: Rect; o: RoomOpening }> = ({ r, o }) => {
  const vertical = o.side === 'left' || o.side === 'right';
  const line = o.side === 'left' ? r.x : o.side === 'right' ? r.x + r.w : o.side === 'top' ? r.y : r.y + r.h;
  const a = (vertical ? r.y : r.x) + o.at, b = a + o.w;
  const t = OUT_FT + 0.02;
  const cut = vertical
    ? <rect x={line - t} y={a} width={2 * t} height={o.w} fill={PAPER} />
    : <rect x={a} y={line - t} width={o.w} height={2 * t} fill={PAPER} />;
  if (o.kind === 'window') {
    const g = 0.12;
    return (
      <g data-opening="window">
        {cut}
        {vertical ? (
          <>
            <line x1={line - g} y1={a} x2={line - g} y2={b} stroke={WALL} strokeWidth={LINE} />
            <line x1={line + g} y1={a} x2={line + g} y2={b} stroke={WALL} strokeWidth={LINE} />
            <line x1={line - t} y1={a} x2={line + t} y2={a} stroke={WALL} strokeWidth={LINE} />
            <line x1={line - t} y1={b} x2={line + t} y2={b} stroke={WALL} strokeWidth={LINE} />
          </>
        ) : (
          <>
            <line x1={a} y1={line - g} x2={b} y2={line - g} stroke={WALL} strokeWidth={LINE} />
            <line x1={a} y1={line + g} x2={b} y2={line + g} stroke={WALL} strokeWidth={LINE} />
            <line x1={a} y1={line - t} x2={a} y2={line + t} stroke={WALL} strokeWidth={LINE} />
            <line x1={b} y1={line - t} x2={b} y2={line + t} stroke={WALL} strokeWidth={LINE} />
          </>
        )}
      </g>
    );
  }
  // The door hinges at the side's start and swings into the room.
  const into = o.side === 'top' || o.side === 'left' ? 1 : -1;
  const w = o.w;
  const leaf = vertical
    ? { x1: line, y1: a, x2: line + into * w, y2: a }
    : { x1: a, y1: line, x2: a, y2: line + into * w };
  // The swing, from the open leaf's tip to the far jamb, a quarter circle about the hinge (y down: sweep 1 turns clockwise).
  const sweep = o.side === 'bottom' || o.side === 'left' ? 1 : 0;
  const arc = vertical
    ? `M ${line + into * w} ${a} A ${w} ${w} 0 0 ${sweep} ${line} ${b}`
    : `M ${a} ${line + into * w} A ${w} ${w} 0 0 ${sweep} ${b} ${line}`;
  return (
    <g data-opening="door">
      {cut}
      <line {...leaf} stroke={WALL} strokeWidth={LINE * 1.5} />
      <path d={arc} fill="none" stroke={WALL} strokeWidth={LINE} strokeDasharray={`${LINE * 3} ${LINE * 2}`} />
    </g>
  );
};

/** The walls, the rooms' paper over them, then the doors and windows cut into the walls. */
export function LinePlanRooms({ rooms }: { rooms: LineRoom[] }) {
  const rs = rooms.filter(r => r.plan);
  return (
    <g pointerEvents="none" data-line-plan>
      {rs.map(r => (
        <rect key={`wall-${r.name}`} x={r.plan!.x - OUT_FT} y={r.plan!.y - OUT_FT} width={r.plan!.w + 2 * OUT_FT} height={r.plan!.h + 2 * OUT_FT} fill={WALL} />
      ))}
      {rs.map(r => (
        <rect key={`paper-${r.name}`} x={r.plan!.x + IN_FT} y={r.plan!.y + IN_FT} width={Math.max(0, r.plan!.w - 2 * IN_FT)} height={Math.max(0, r.plan!.h - 2 * IN_FT)} fill={PAPER} />
      ))}
      {rs.flatMap(r => (r.openings || []).map((o, i) => <Opening key={`o-${r.name}-${i}`} r={r.plan!} o={o} />))}
    </g>
  );
}
