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

/** How far a wall reaches out past a room's edge, ft: the outside wall is this plus IN_FT, about 10″, twice an inside wall as in the mockup. */
export const OUT_FT = 0.6875;
/** How far a room's floor stops short of its edge, ft: an inside wall is twice this, 4½″. */
export const IN_FT = 0.1875;
const WALL = '#262626';
const PAPER = '#f7f6f2';
const LINE = 0.06;
/* The plan's print, inside the drawing only (DESIGN.md "The drawing"). */
const LABEL_INK = '#334155';
const DIM_INK = '#64748b';
const EMPTY_INK = '#1e293b';
const HATCH = '#8a8a8a';
const GLASS = '#ffffff';

/** A door or window's width as the plan prints it, to the nearest 3″: D 3'-0", W 4'-6". */
export const openingSize = (o: Pick<RoomOpening, 'kind' | 'w'>) => `${o.kind === 'door' ? 'D' : 'W'} ${planDim(Math.round(o.w * 4) / 4)}`;

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
const RoomLabel: React.FC<{ r: LineRoom; clearance: number; empty?: boolean }> = ({ r, clearance, empty }) => {
  const p = r.plan!;
  const name = r.name.toUpperCase();
  const room = p.w - 2 * IN_FT - 0.6;
  const size = Math.min(empty ? 0.72 : 0.62, room / Math.max(1, name.length * 0.68));
  if (size < 0.3) return null;
  // An empty room (no tag), as the mockup names PASSAGE and DRESS: its name alone, bold, centred.
  if (empty) {
    if (size > p.h - 2 * IN_FT - 0.4) return null;
    return (
      <g data-room-label={r.name}>
        <text x={p.x + p.w / 2} y={p.y + p.h / 2 + size * 0.35} fontSize={size} fontWeight={800} fill={EMPTY_INK} textAnchor="middle" letterSpacing={size * 0.04}
          stroke={PAPER} strokeWidth={size * 0.3} strokeLinejoin="round" paintOrder="stroke">{name}</text>
      </g>
    );
  }
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

/**
 * A door or window drawn in a room's side, as the mockup draws them: the wall
 * cut; a door's leaf open into the room and its swing, a thin solid quarter
 * circle; a window's white pane across the wall with its frame and glazing
 * lines. Its width is printed: a door's inside its swing, a window's outside
 * the flat, so neither lands on a room's name or another door's size.
 */
const Opening: React.FC<{ r: Rect; o: RoomOpening }> = ({ r, o }) => {
  const vertical = o.side === 'left' || o.side === 'right';
  const line = o.side === 'left' ? r.x : o.side === 'right' ? r.x + r.w : o.side === 'top' ? r.y : r.y + r.h;
  const a = (vertical ? r.y : r.x) + o.at, b = a + o.w;
  const t = OUT_FT + 0.02;
  // Into the room: + for a top or left side, − for a bottom or right one.
  const into = o.side === 'top' || o.side === 'left' ? 1 : -1;
  // A door's inside its swing (the quarter circle it sweeps), towards the far jamb; a window's outside the flat.
  const door = o.kind === 'door';
  const mid = door ? a + o.w * 0.6 : (a + b) / 2;
  const off = door ? line + into * o.w * 0.4 : line - into * (t + 0.42);
  const fs = door ? Math.min(0.36, o.w * 0.15) : 0.4;
  const size = (
    <text x={vertical ? off : mid} y={vertical ? mid : off + fs * 0.35} fontSize={fs} fontWeight={600} fill={DIM_INK} textAnchor="middle"
      transform={vertical ? `rotate(-90 ${off} ${mid})` : undefined} dy={vertical ? fs * 0.35 : 0}
      stroke={PAPER} strokeWidth={fs * 0.3} strokeLinejoin="round" paintOrder="stroke" data-opening-size>{openingSize(o)}</text>
  );
  if (o.kind === 'window') {
    const pane = vertical
      ? { x: line - t, y: a, width: 2 * t, height: o.w }
      : { x: a, y: line - t, width: o.w, height: 2 * t };
    const lines = [-t * 0.45, 0, t * 0.45];
    return (
      <g data-opening="window">
        <rect {...pane} fill={GLASS} stroke={WALL} strokeWidth={LINE} />
        {lines.map((d, i) => vertical
          ? <line key={i} x1={line + d} y1={a} x2={line + d} y2={b} stroke={WALL} strokeWidth={LINE * 0.8} />
          : <line key={i} x1={a} y1={line + d} x2={b} y2={line + d} stroke={WALL} strokeWidth={LINE * 0.8} />)}
        {size}
      </g>
    );
  }
  const cut = vertical
    ? <rect x={line - t} y={a} width={2 * t} height={o.w} fill={PAPER} />
    : <rect x={a} y={line - t} width={o.w} height={2 * t} fill={PAPER} />;
  // The door hinges at the side's start; the swing runs from the open leaf's tip to the far jamb (y down: sweep 1 turns clockwise).
  const w = o.w;
  const leaf = vertical
    ? { x1: line, y1: a, x2: line + into * w, y2: a }
    : { x1: a, y1: line, x2: a, y2: line + into * w };
  const sweep = o.side === 'bottom' || o.side === 'left' ? 1 : 0;
  const arc = vertical
    ? `M ${line + into * w} ${a} A ${w} ${w} 0 0 ${sweep} ${line} ${b}`
    : `M ${a} ${line + into * w} A ${w} ${w} 0 0 ${sweep} ${b} ${line}`;
  return (
    <g data-opening="door">
      {cut}
      <line {...leaf} stroke={WALL} strokeWidth={LINE * 1.4} />
      <path d={arc} fill="none" stroke={WALL} strokeWidth={LINE} />
      {size}
    </g>
  );
};

/** The walls, the rooms' paper over them, and the doors and windows cut into the walls. Names and sizes: LinePlanLabels. */
export function LinePlanRooms({ rooms }: { rooms: LineRoom[] }) {
  const rs = rooms.filter(r => r.plan);
  /*
    Three layers, as the mockup draws walls: every room's outline OUT_FT out,
    hatched and edged (what is left of it is the outside wall, its outer face
    hatched); IN_FT out, solid (inside walls are solid, and so is the outside
    wall's inner face); then the floor, IN_FT in.
  */
  return (
    <g pointerEvents="none" data-line-plan>
      <defs>
        <pattern id="lp-hatch" width={0.2} height={0.2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={0.2} height={0.2} fill={WALL} />
          <line x1={0} y1={0} x2={0} y2={0.2} stroke={HATCH} strokeWidth={0.05} />
        </pattern>
      </defs>
      {rs.map(r => (
        <rect key={`hatch-${r.name}`} x={r.plan!.x - OUT_FT} y={r.plan!.y - OUT_FT} width={r.plan!.w + 2 * OUT_FT} height={r.plan!.h + 2 * OUT_FT}
          fill="url(#lp-hatch)" stroke={WALL} strokeWidth={LINE * 1.2} />
      ))}
      {rs.map(r => (
        <rect key={`wall-${r.name}`} x={r.plan!.x - IN_FT} y={r.plan!.y - IN_FT} width={r.plan!.w + 2 * IN_FT} height={r.plan!.h + 2 * IN_FT} fill={WALL} />
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
export function LinePlanLabels({ rooms, tagClearance = 0, tagged }: { rooms: LineRoom[]; tagClearance?: number; tagged?: (name: string) => boolean }) {
  return (
    <g pointerEvents="none" data-line-plan-labels>
      {rooms.filter(r => r.plan).map(r => (
        <RoomLabel key={`l-${r.name}`} r={r} clearance={!tagged || tagged(r.name) ? tagClearance : 0} empty={!!tagged && !tagged(r.name)} />
      ))}
    </g>
  );
}

/**
 * The drawing's title block, as the mockup puts it under the plan's right
 * corner: the project, its configuration and city; the drawing and its area.
 */
export function LinePlanTitle({ rooms, title, sub }: { rooms: LineRoom[]; title: string; sub: string }) {
  const rs = rooms.filter(r => r.plan);
  if (!rs.length) return null;
  const maxX = Math.max(...rs.map(r => r.plan!.x + r.plan!.w)) + OUT_FT;
  const maxY = Math.max(...rs.map(r => r.plan!.y + r.plan!.h)) + OUT_FT;
  const f1 = 0.5, f2 = 0.4, pad = 0.45;
  const w = Math.max(title.length * f1 * 0.62, sub.length * f2 * 0.58) + 2 * pad;
  const h = pad * 2 + f1 + 0.3 + f2;
  const x = maxX - w, y = maxY + 1;
  return (
    <g pointerEvents="none" data-line-plan-title>
      <rect x={x} y={y} width={w} height={h} fill={GLASS} stroke={WALL} strokeWidth={LINE} />
      <text x={x + pad} y={y + pad + f1 * 0.85} fontSize={f1} fontWeight={700} fill={LABEL_INK} letterSpacing={f1 * 0.03}>{title}</text>
      <text x={x + pad} y={y + pad + f1 + 0.3 + f2 * 0.85} fontSize={f2} fontWeight={500} fill={DIM_INK}>{sub}</text>
    </g>
  );
}
