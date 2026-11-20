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
/* The plan's print, inside the drawing only (DESIGN.md "The drawing"). */
const LABEL_INK = '#334155';
const DIM_INK = '#64748b';

/** A plan sheet whose drawing can be shown under the rooms: an image with its scale set. */
export const drawingOf = (sheet: PlanSheet | null | undefined): PlanSheet | null =>
  sheet?.imageUrl && Number(sheet.ftPerPx) > 0 && sheet.imagePx && !isPdfSheet(sheet) ? sheet : null;

type Rect = { x: number; y: number; w: number; h: number };
interface LineRoom { name: string; plan?: Rect; openings?: RoomOpening[]; length?: number; width?: number; dimSource?: string }

/** A length as a plan prints it: 13'-0", 7'-10". */
export function planDim(ft: number): string {
  let f = Math.floor(ft + 1e-9);
  let i = Math.round((ft - f) * 12);
  if (i === 12) { f++; i = 0; }
  return `${f}'-${i}"`;
}

/**
 * The size printed under a room's name: the size the client's plan printed
 * when it was read (the longer side along the room's longer side), else the
 * room as drawn. Across first, then deep, as the mockup prints it.
 */
export function roomDims(r: LineRoom): string {
  const p = r.plan!;
  const L = Number(r.length), W = Number(r.width);
  if (r.dimSource === 'read' && L > 0 && W > 0) {
    const long = Math.max(L, W), short = Math.min(L, W);
    return p.w >= p.h ? `${planDim(long)} X ${planDim(short)}` : `${planDim(short)} X ${planDim(long)}`;
  }
  return `${planDim(p.w)} X ${planDim(p.h)}`;
}

/**
 * The room's name and size, printed on the plan as the mockup prints them:
 * in capitals, centred, just above the price tag at the room's centre, under
 * the furniture. Sized to the room's width; where there is no room above the
 * tag for the size it is left off, and where not even the name fits the tag
 * names the room alone.
 */
const RoomLabel: React.FC<{ r: LineRoom; clearance: number }> = ({ r, clearance }) => {
  const p = r.plan!;
  const name = r.name.toUpperCase();
  const room = p.w - 2 * IN_FT - 0.6;
  const size = Math.min(0.62, room / Math.max(1, name.length * 0.68));
  if (size < 0.3) return null;
  const dims = roomDims(r);
  const dsize = Math.min(size * 0.8, room / Math.max(1, dims.length * 0.6));
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const gap = 0.3;
  const withDims = size + gap * 0.8 + dsize;
  // With a price tag at the room's centre (the Plan lens), the label sits just above it; without one, at the centre.
  const room4 = clearance > 0 ? (cy - clearance - gap) - (p.y + IN_FT + 0.3) : p.h - 2 * IN_FT - 0.6;
  const showDims = dsize >= 0.26 && withDims <= room4;
  if (!showDims && size > room4) return null;
  const block = showDims ? withDims : size;
  const top = clearance > 0 ? cy - clearance - gap - block : cy - block / 2;
  return (
    <g data-room-label={r.name}>
      <text x={cx} y={top + size * 0.85} fontSize={size} fontWeight={700} fill={LABEL_INK} textAnchor="middle" letterSpacing={size * 0.04}
        stroke={PAPER} strokeWidth={size * 0.3} strokeLinejoin="round" paintOrder="stroke">{name}</text>
      {showDims && <text x={cx} y={top + size + gap * 0.8 + dsize * 0.85} fontSize={dsize} fontWeight={500} fill={DIM_INK} textAnchor="middle"
        stroke={PAPER} strokeWidth={dsize * 0.3} strokeLinejoin="round" paintOrder="stroke">{dims}</text>}
    </g>
  );
};

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

/** The walls, the rooms' paper over them, and the doors and windows cut into the walls. Names and sizes: LinePlanLabels. */
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

/**
 * Each room's name and size, drawn over the furniture with a paper-coloured
 * edge so a wardrobe or a vanity does not cut it, and under the price tags.
 * `tagClearance`: half the height of the price tag at each room's centre, in
 * feet at the current zoom (0 where no tags are drawn).
 */
export function LinePlanLabels({ rooms, tagClearance = 0 }: { rooms: LineRoom[]; tagClearance?: number }) {
  return (
    <g pointerEvents="none" data-line-plan-labels>
      {rooms.filter(r => r.plan).map(r => <RoomLabel key={`l-${r.name}`} r={r} clearance={tagClearance} />)}
    </g>
  );
}
