import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tradeIcon } from '../ui/tradeIcon';
import { Minus, Plus, Maximize } from 'lucide-react';
import type { ProjectContext, Item, BoqItem, Room } from '../../types';
import { boardPieces, drawOf, isHigh, isWallBacked, pieceSize, footprintOf, pieceItemOf, type BoardPiece } from '../../lib/playground/pieces';
import { placeAt, softSnap, type PlacedPiece, type SnapGuide, type PlanRoom } from '../../lib/playground/placing';
import { boundsOf, ftin, normRot, pieceBox } from '../../lib/playground/geometry';
import { lineIssues } from '../../lib/playground/issues';
import { sheetOf } from '../../lib/playground/planSheet';
import { LinePlanRooms, LinePlanLabels, LinePlanTitle, drawingOf } from './linePlan';
import { newPieceLine, movedLine, resizedFromEdge, type Edge } from '../../lib/playground/board';
import { resizeRoom, edgeAt, type RoomEdge, type RoomResize } from '../../lib/playground/roomEdges';
import { segmentFor, segLength, toolOf, type CivilTool, type Segment } from '../../lib/playground/civil';
import { PieceArt } from './pieceArt';
import { KIT_DRAG, KIT_TYPE } from './KitParts';
import { TAG_COLOUR, shortInr, type Changes } from '../../lib/playground/changes';
import { inr, lakh, type LineModel, type FreshState } from './playgroundUi';

/*
  The Plan lens's stage (BOQ Playground, as in the approved mockup).

  The flat drawn to scale on a dotted ground: the plan underneath, each room
  tinted by what it costs, the furniture drawn from above, and a price tag on
  every room. Drag an item from the library onto a room and it becomes a line
  there; drag a piece to move it (magnets pull it onto walls and its neighbours;
  Alt places it freely), pull a handle to resize it (its quantity follows), the
  round handle to turn it. Drag the ground to pan; the wheel and the buttons zoom.
  Pick a room and pull the handle on one of its walls to size it (PR 5): the
  room across a shared wall gives the same, and the pieces against it move.

  The Civil layer (PR C): the furniture fades back, and the civil work is drawn
  over the rooms (a new floor, waterproofing, wall tiles to 7′, each tagged)
  with the walls broken and built as segments. With a tool picked, a drag in a
  room draws a wall broken (snapped to the nearest wall) or built; a click on a
  room puts its re-flooring, wall tiles or waterproofing in, or takes them out.

  One drag is one write of the BOQ, so one undo. Only the piece being dragged
  redraws while it moves.
*/

const BRAND = '#3D52A0';

export interface View { k: number; tx: number; ty: number }

interface Props {
  ctx: ProjectContext;
  rooms: Room[];
  boq: BoqItem[];
  bank: Item[];
  bankMap: Map<string, Item>;
  models: Map<string, LineModel>;
  roomTotals: Map<string, number>;
  readOnly: boolean;
  sel: string | null;
  onSel: (id: string | null) => void;
  selRoom: string | null;
  onSelRoom: (name: string | null) => void;
  commit: (next: BoqItem[], msg?: string) => void;
  newId: () => string;
  /** The library is open over the stage's left side: the view leaves room for it. */
  libOpen: boolean;
  /** Seen in figures hidden mode: prices on the tags are left out. */
  hideFigures?: boolean;
  /** Asked to fit the view again (a counter). */
  fitSignal?: number;
  /** A new line from the library, given its recipe's materials (S2). */
  prepareNew?: (line: BoqItem) => BoqItem;
  /** A room pulled to a new size by its wall handle (PR 5): the rooms that changed, and the BOQ with the pieces moved. */
  onRooms?: (rooms: Room[], boq: BoqItem[], changed: string[]) => void;
  /** Which layer is on: Interiors (the furniture) or Civil (PR C). */
  layer?: 'int' | 'civ';
  /** The Civil tool picked, if any. */
  civilTool?: CivilTool | null;
  /** A room tool clicked on a room: re-flooring, wall tiles, waterproofing. */
  onCivilRoom?: (room: string, tool: 'floor' | 'walls7' | 'waterproof') => void;
  /** A wall broken or built: the segment drawn in a room. */
  onCivilWall?: (tool: 'break' | 'build', room: string, segment: Segment) => void;
  /** Says something to the person (a click outside every room, a drag too short). */
  onNote?: (msg: string) => void;
  /** A room kit dropped on a room (PR K): its preview opens for that room. */
  onDropKit?: (kitId: string, room: string) => void;
  /** Show changes since the version before (PR R): each changed piece outlined and tagged, the ones taken out drawn faint. */
  changes?: Changes | null;
  /** What the last edit did (PR 7): pieces drop in, the room glows, the price change floats up. */
  fresh?: FreshState | null;
  /** The client's drawing under the rooms; otherwise a plan read off it is drawn as a line plan. */
  showDrawing?: boolean;
}

type Drag =
  | { kind: 'move'; id: string; offset: [number, number]; start: BoqItem; live: BoqItem; room: string | null; guides: SnapGuide[] }
  | { kind: 'resize'; id: string; sx: number; sy: number; from: [number, number]; start: BoqItem; live: BoqItem }
  | { kind: 'turn'; id: string; start: BoqItem; live: BoqItem }
  | { kind: 'pan'; from: [number, number]; view: View; room: string | null }
  | { kind: 'room'; name: string; edge: RoomEdge; live: RoomResize | null }
  | { kind: 'civdraw'; tool: 'break' | 'build'; room: string; a: [number, number]; b: [number, number] };

/** Counts piece redraws, so a test can hold a drag to one piece per frame. */
export const stageStats = { pieceRenders: 0 };

export default function PlanStage(props: Props) {
  const { ctx, bank, bankMap, models, roomTotals, readOnly, sel, onSel, selRoom, onSelRoom, commit, newId, libOpen, hideFigures, fitSignal, prepareNew, onRooms, layer = 'int', civilTool, onCivilRoom, onCivilWall, onNote, onDropKit, changes, fresh } = props;
  const civ = layer === 'civ';
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 20, tx: 40, ty: 60 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const panMoved = useRef(false);
  const last = useRef<{ at: [number, number]; alt: boolean; shift: boolean } | null>(null);
  /* While a room's wall is pulled, the plan shows the rooms and pieces as they would be. */
  const pulled = drag?.kind === 'room' ? drag.live : null;
  const rooms = pulled ? pulled.rooms : props.rooms;
  const boq = pulled ? pulled.boq : props.boq;

  const planRooms: PlanRoom[] = useMemo(() => rooms.filter(r => r.plan).map(r => ({ name: r.name, plan: r.plan })), [rooms]);
  const sheet = sheetOf(ctx);
  /*
    The client's drawing is under the rooms only when asked for (showDrawing);
    otherwise a plan read off a drawing is drawn as a line plan (linePlan.tsx).
  */
  const drawing = drawingOf(sheet);
  const underlay = props.showDrawing ? drawing : null;
  const traced = !!drawing && !props.showDrawing;

  /* The pieces from the BOQ; while dragging only the dragged one is swapped in. */
  const basePieces = useMemo(() => boardPieces(boq, bankMap), [boq, bankMap]);
  const livePiece = useMemo(() => (drag && (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'turn') ? boardPieces([drag.live], bankMap)[0] : undefined), [drag, bankMap]);
  const pieces = useMemo(() => {
    const ps = livePiece ? basePieces.map(p => (p.id === livePiece.id ? livePiece : p)) : basePieces;
    return [...ps].sort((a, b) => Number(a.high) - Number(b.high));
  }, [basePieces, livePiece]);
  const flagged = useMemo(() => new Set(basePieces.filter(p =>
    lineIssues(p.line, { bankMap, pieces: basePieces, rooms: planRooms }).includes('overlap')).map(p => p.id)),
  [basePieces, bankMap, planRooms]);

  /* ── the view ── */

  const bounds = useMemo(() => {
    const rects = planRooms.map(r => r.plan!);
    if (underlay) {
      const k = underlay.ftPerPx!, o = underlay.origin || { x: 0, y: 0 };
      rects.push({ x: -o.x * k, y: -o.y * k, w: underlay.imagePx!.w * k, h: underlay.imagePx!.h * k });
    }
    /* The line plan's title block sits under its right corner (linePlan.tsx): the view takes it in. */
    if (traced && rects.length) {
      const b = boundsOf(rects)!;
      rects.push({ x: b.x, y: b.y + b.h, w: b.w, h: 3.2 });
    }
    return boundsOf(rects) || { x: 0, y: 0, w: 30, h: 20 };
  }, [planRooms, underlay, traced]);

  const fit = useCallback(() => {
    const { w, h } = size;
    if (w < 160 || h < 160) return;
    const L = libOpen && w > 520 ? 244 : 0, T = 50, B = 50;
    const bx = bounds.x - 1, by = bounds.y - 1, bw = bounds.w + 2, bh = bounds.h + 2;
    const W = w - L - 20, H = h - T - B;
    const k = Math.min(W / bw, H / bh);
    setView({ k, tx: L + 10 + (W - bw * k) / 2 - bx * k, ty: T + (H - bh * k) / 2 - by * k });
  }, [size, libOpen, bounds]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); setSize(s => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height })); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { fit(); }, [fit, fitSignal]);

  const zoomBy = (f: number, cx = size.w / 2, cy = size.h / 2) => setView(v => {
    const k = Math.max(2, Math.min(200, v.k * f));
    const r = k / v.k;
    return { k, tx: cx - (cx - v.tx) * r, ty: cy - (cy - v.ty) * r };
  });
  /* The wheel zooms around the pointer (the listener is not passive, so the page does not scroll). */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const px = (n: number) => n / view.k;
  const pt = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left - view.tx) / view.k, (e.clientY - r.top - view.ty) / view.k];
  };
  const toScreen = (x: number, y: number): [number, number] => [x * view.k + view.tx, y * view.k + view.ty];

  /* ── adding from the library ── */

  const asPlaced = (line: BoqItem): PlacedPiece | null => {
    const item = pieceItemOf(line, bankMap);
    const draw = drawOf(item);
    if (!draw || !line.place) return null;
    return { id: line.id, room: line.roomId, fp: footprintOf(pieceSize(line, item, draw)), place: line.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };
  /* A room kit dragged over the plan lights the room it would land in (PR K). */
  const [kitOver, setKitOver] = useState<string | null>(null);
  const roomUnder = (at: [number, number] | null) =>
    at ? planRooms.find(r => at[0] >= r.plan!.x && at[0] <= r.plan!.x + r.plan!.w && at[1] >= r.plan!.y && at[1] <= r.plan!.y + r.plan!.h) || null : null;
  const isKitDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes(KIT_TYPE);
  const onDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (isKitDrag(e)) { const r = roomUnder(pt(e))?.name || null; if (r !== kitOver) setKitOver(r); }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setKitOver(null);
    if (readOnly) return;
    const text = e.dataTransfer.getData('text/plain') || '';
    if (text.startsWith(KIT_DRAG)) {
      const room = roomUnder(pt(e));
      if (room) onDropKit?.(text.slice(KIT_DRAG.length), room.name);
      else onNote?.('Drop the kit inside a room.');
      return;
    }
    const item = bank.find(i => i.id === text);
    const at = pt(e);
    const draw = drawOf(item);
    if (!item || !at || !draw) return;
    const probe: PlacedPiece = { id: '__new', fp: { w: draw.w, d: draw.d }, place: { x: at[0], y: at[1], rot: 0 }, high: isHigh(draw), wallBacked: isWallBacked(draw) };
    const p = placeAt(probe, at[0], at[1], planRooms, { free: e.altKey });
    const made = newPieceLine(item, p.room, p.place, newId());
    if (!made) return;
    const line = prepareNew ? prepareNew(made) : made;
    commit([...boq, line], `${item.name} added${p.room ? ` to ${p.room}` : ''}.`);
    onSel(line.id);
  };

  /* ── gestures ── */

  const replace = (line: BoqItem, msg?: string) => commit(boq.map(l => (l.id === line.id ? line : l)), msg);

  const startMove = (e: React.PointerEvent, p: BoardPiece) => {
    e.stopPropagation();
    onSel(p.id);
    if (readOnly) return;
    const at = pt(e);
    if (!at) return;
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'move', id: p.id, offset: [at[0] - p.place.x, at[1] - p.place.y], start: p.line, live: p.line, room: p.room || null, guides: [] });
  };
  const startResize = (e: React.PointerEvent, p: BoardPiece, sx: number, sy: number) => {
    e.stopPropagation();
    if (readOnly) return;
    const at = pt(e);
    if (!at) return;
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'resize', id: p.id, sx, sy, from: at, start: p.line, live: p.line });
  };
  const startTurn = (e: React.PointerEvent, p: BoardPiece) => {
    e.stopPropagation();
    if (readOnly) return;
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'turn', id: p.id, start: p.line, live: p.line });
  };
  const startRoom = (e: React.PointerEvent, name: string, edge: RoomEdge) => {
    e.stopPropagation();
    if (readOnly || !onRooms) return;
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'room', name, edge, live: null });
  };
  /* The Civil layer's tools: a drag draws a wall broken or built; a click toggles a room's civil work. */
  const startCivil = (e: React.PointerEvent): boolean => {
    if (!civ || !civilTool) return false;
    e.stopPropagation();
    if (readOnly) return true;
    const at = pt(e);
    if (!at) return true;
    const room = planRooms.find(r => r.plan && at[0] >= r.plan.x && at[0] <= r.plan.x + r.plan.w && at[1] >= r.plan.y && at[1] <= r.plan.y + r.plan.h);
    if (!room) { onNote?.('Click inside a room.'); return true; }
    if (civilTool === 'break' || civilTool === 'build') {
      wrapRef.current?.setPointerCapture?.(e.pointerId);
      setDrag({ kind: 'civdraw', tool: civilTool, room: room.name, a: at, b: at });
    } else onCivilRoom?.(room.name, civilTool);
    return true;
  };
  const startPan = (e: React.PointerEvent, room: string | null) => {
    if (startCivil(e)) return;
    panMoved.current = false;
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'pan', from: [e.clientX, e.clientY], view, room });
  };

  const liveFor = (d: Drag, at: [number, number], alt: boolean, shift: boolean): Drag => {
    if (d.kind === 'pan') return d;
    if (d.kind === 'civdraw') return { ...d, b: at };
    if (d.kind === 'room') {
      const to = d.edge === 'left' || d.edge === 'right' ? at[0] : at[1];
      return { ...d, live: resizeRoom({ rooms: props.rooms, boq: props.boq, bankMap, name: d.name, edge: d.edge, to }) };
    }
    if (d.kind === 'move') {
      const me = asPlaced(d.start)!;
      const s = softSnap(me, at[0] - d.offset[0], at[1] - d.offset[1], planRooms, basePieces.filter(p => p.id !== d.id), { thresholdFt: 9 / view.k, free: alt });
      const room = planRooms.find(r => r.plan && at[0] >= r.plan.x && at[0] <= r.plan.x + r.plan.w && at[1] >= r.plan.y && at[1] <= r.plan.y + r.plan.h);
      return { ...d, live: movedLine(d.start, { x: s.x, y: s.y, rot: d.start.place!.rot }, room ? room.name : null), room: room ? room.name : null, guides: s.guides };
    }
    const place = d.start.place!;
    if (d.kind === 'turn') {
      const deg = (Math.atan2(at[1] - place.y, at[0] - place.x) * 180) / Math.PI + 90;
      const rot = shift ? normRot(deg) : normRot(Math.round(deg / 15) * 15);
      return { ...d, live: { ...d.start, place: { ...place, rot } } };
    }
    const rot = (place.rot * Math.PI) / 180;
    const dx = at[0] - d.from[0], dy = at[1] - d.from[1];
    const along = dx * Math.cos(rot) + dy * Math.sin(rot);
    const across = -dx * Math.sin(rot) + dy * Math.cos(rot);
    const item = pieceItemOf(d.start, bankMap);
    let live = d.start;
    if (d.sx) live = resizedFromEdge(live, item, (d.sx > 0 ? 'right' : 'left') as Edge, d.sx > 0 ? along : -along);
    if (d.sy) live = resizedFromEdge(live, item, (d.sy > 0 ? 'front' : 'back') as Edge, d.sy > 0 ? across : -across);
    return { ...d, live };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.from[0], dy = e.clientY - drag.from[1];
      if (Math.abs(dx) + Math.abs(dy) > 4) panMoved.current = true;
      if (panMoved.current) setView({ k: drag.view.k, tx: drag.view.tx + dx, ty: drag.view.ty + dy });
      return;
    }
    const at = pt(e);
    if (!at) return;
    last.current = { at, alt: e.altKey, shift: e.shiftKey };
    if (frame.current != null) return;
    const step = () => {
      frame.current = null;
      const l = last.current;
      if (l) setDrag(d => (d ? liveFor(d, l.at, l.alt, l.shift) : d));
    };
    frame.current = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(step) : (step(), null);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const end = last.current;
    last.current = null;
    const d = end ? liveFor(drag, end.at, end.alt, end.shift) : drag;
    setDrag(null);
    if (d.kind === 'pan') {
      if (!panMoved.current) { onSel(null); onSelRoom(d.room); }
      return;
    }
    if (d.kind === 'room') {
      if (d.live && onRooms) onRooms(d.live.rooms, d.live.boq, d.live.changed);
      return;
    }
    if (d.kind === 'civdraw') {
      const room = props.rooms.find(r => r.name === d.room);
      const seg = room ? segmentFor(d.tool, room, d.a, d.b) : null;
      if (seg) onCivilWall?.(d.tool, d.room, seg);
      else onNote?.('Drag a little further: a wall is at least 1 ft long, inside the room.');
      return;
    }
    if (d.live === d.start) return;
    if (d.kind === 'move') {
      const me = asPlaced(d.live)!;
      const at = placeAt(me, d.live.place!.x, d.live.place!.y, planRooms, { free: e.altKey || !!end?.alt });
      const moved = movedLine(d.start, at.place, at.room || d.room);
      replace(moved, at.room && at.room !== d.start.roomId ? `Moved to ${at.room}.` : undefined);
    } else {
      replace(d.live);
    }
  };
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);

  /* Stable handlers, so a piece's memoised drawing is not redrawn for a new function. */
  const handlers = useRef({ startMove });
  handlers.current = { startMove };
  const onPieceDown = useCallback((e: React.PointerEvent, p: BoardPiece) => handlers.current.startMove(e, p), []);

  /* ── drawing ── */

  const maxRoom = Math.max(1, ...rooms.map(r => roomTotals.get(r.name) || 0));
  const selected = sel ? pieces.find(p => p.id === sel) : undefined;
  const selModel = sel ? models.get(sel) : undefined;
  const tight = view.k < 22;

  /* Each room's work that is not drawn, as its trades' marks (components/ui/tradeIcon), commonest first. */
  const workMarks = useMemo(() => {
    const byRoom = new Map<string, Map<React.ComponentType<any>, { Icon: React.ComponentType<any>; label: string; n: number }>>();
    models.forEach(m => {
      if (m.draw || !m.room) return;
      const Icon = tradeIcon(`${m.name} ${m.cat}`);
      const room = byRoom.get(m.room) || new Map();
      const cur = room.get(Icon);
      if (cur) { cur.n++; cur.label = `${cur.label}, ${m.name}`; }
      else room.set(Icon, { Icon, label: m.name, n: 1 });
      byRoom.set(m.room, room);
    });
    const out = new Map<string, { Icon: React.ComponentType<any>; label: string; n: number }[]>();
    byRoom.forEach((marks, room) => out.set(room, [...marks.values()].sort((a, b) => b.n - a.n)));
    return out;
  }, [models]);

  const roomHasLines = (name: string) => (roomTotals.get(name) || 0) > 0 || boq.some(l => l.roomId === name);
  /* The title block under the line plan (linePlan.tsx LinePlanTitle). */
  const planTitle = [String(ctx.name || 'Project').split(/[·–—]/)[0].trim(), ctx.config, String(ctx.location || '').split(/[,·]/)[0].trim()]
    .filter(Boolean).join(' · ').toUpperCase();
  const planSub = `LAYOUT PLAN${Number(ctx.area) > 0 ? ` · ${Math.round(Number(ctx.area))} SQ FT` : ''} · FROM THE CLIENT’S PLAN`;
  const tags = planRooms.map(r => {
    const room = rooms.find(x => x.name === r.name)!;
    const price = roomTotals.get(r.name) || 0;
    const has = price > 0 || boq.some(l => l.roomId === r.name);
    /* On the line plan an empty room is named by the plan alone, as in the mockup (PASSAGE, DRESS, UTILITY). */
    if (traced && !has) return null;
    const narrow = r.plan!.w < 6 || tight;
    const name = (narrow && room.name.length > 10 ? room.name.split(/\s+/)[0] : room.name).toUpperCase();
    const pr = !has ? 'Empty' : hideFigures ? '' : narrow ? lakh(price).replace(' L', 'L') : inr(price);
    const fn = px(10), fp = px(14);
    const w = Math.max(name.length * fn * 0.68, pr.length * fp * 0.6) + px(14);
    const h = (pr ? fn + fp : fn) + px(14);
    const cx = r.plan!.x + r.plan!.w / 2, cy = r.plan!.y + r.plan!.h / 2;
    /* The room's work that is not drawn (civil, plumbing, electrical…): one mark for each trade, under its tag. */
    const marks = workMarks.get(r.name) || [];
    const shown = marks.slice(0, narrow ? 3 : 5);
    const ms = px(22), mg = px(4);
    const mw = shown.length * ms + (shown.length - 1) * mg + (marks.length > shown.length ? px(16) : 0);
    const my = cy + h / 2 + px(5);
    return (
      <g key={r.name} pointerEvents="none">
        {shown.length > 0 && (
          <g aria-label={`${room.name}: ${marks.map(m => m.label).join(', ')}`}>
            {shown.map((m, i) => {
              const x = cx - mw / 2 + i * (ms + mg);
              return (
                <g key={m.label} data-work-mark={m.label}>
                  <rect x={x} y={my} width={ms} height={ms} rx={px(6)} fill="#fff" fillOpacity={0.96} stroke="#e2e8f0" strokeWidth={px(1)} />
                  <m.Icon x={x + px(4)} y={my + px(4)} width={px(14)} height={px(14)} color="#475569" strokeWidth={2} aria-hidden />
                </g>
              );
            })}
            {marks.length > shown.length && (
              <text x={cx - mw / 2 + shown.length * (ms + mg) + px(2)} y={my + ms * 0.68} fontSize={px(10)} fontWeight={700} fill="#64748b">+{marks.length - shown.length}</text>
            )}
          </g>
        )}
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={px(8)} fill="#fff" fillOpacity={0.94} stroke={selRoom === r.name ? BRAND : '#e2e8f0'} strokeWidth={px(1)} filter="url(#pg-sh2)" />
        <text x={cx} y={cy - h / 2 + px(6) + fn * 0.85} fontSize={fn} fontWeight={700} fill="#64748b" textAnchor="middle">{name}</text>
        {pr && <text x={cx} y={cy + h / 2 - px(6)} fontSize={fp} fontWeight={800} fill={has ? '#1e293b' : '#94a3b8'} textAnchor="middle">{pr}</text>}
      </g>
    );
  });

  const overlay: React.ReactNode[] = [];
  /* On the Civil layer the furniture's own marks (overlaps, newer specs) step back with it. */
  if (!civ) pieces.forEach(p => {
    if (p.id === sel || !flagged.has(p.id)) return;
    const b = pieceBox(p.fp, p.place);
    overlay.push(<rect key={`f-${p.id}`} x={b.x - 0.06} y={b.y - 0.06} width={b.w + 0.12} height={b.h + 0.12} rx={0.1} fill="rgba(245,158,11,.08)" stroke="#d97706" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(3)}`} pointerEvents="none" />);
  });
  /* A line on an older version of a material: the amber mark the mockup puts at the piece's corner. */
  if (!civ) pieces.forEach(p => {
    if (p.id === sel || !models.get(p.id)?.stale.length) return;
    const b = pieceBox(p.fp, p.place);
    overlay.push(
      <g key={`s-${p.id}`} pointerEvents="none">
        <circle cx={b.x + b.w} cy={b.y} r={px(7)} fill="#f59e0b" stroke="#fff" strokeWidth={px(2)} />
        <text x={b.x + b.w} y={b.y + px(3.5)} fontSize={px(10)} fontWeight={800} fill="#fff" textAnchor="middle">!</text>
      </g>,
    );
  });
  /* Changes since the version before (PR R, the mockup's): an outline and a tag on each changed piece, a dashed
     line from where a moved one was, and the pieces taken out drawn faint where they stood. */
  const ghosts: React.ReactNode[] = [];
  if (changes && !civ) {
    const byId = new Map<string, BoardPiece>(pieces.map(p => [p.id, p] as [string, BoardPiece]));
    changes.out.forEach((e, id) => {
      const colour = TAG_COLOUR[e.tag];
      if (e.gone) {
        const g = e.was?.place ? boardPieces([e.was], bankMap)[0] : undefined;
        if (!g) return;
        const b = pieceBox(g.fp, g.place);
        ghosts.push(
          <g key={`gh-${id}`} data-ghost={id} pointerEvents="none">
            <g opacity={0.4} transform={`translate(${g.place.x} ${g.place.y}) rotate(${g.place.rot})`}><PieceArt kind={g.draw.kind} w={g.size.w} d={g.size.d} words={g.line.specs} high={g.draw.mount === 'high'} /></g>
            <rect x={b.x - 0.08} y={b.y - 0.08} width={b.w + 0.16} height={b.h + 0.16} rx={0.1} fill="rgba(225,29,72,.07)" stroke={colour} strokeWidth={px(1.6)} strokeDasharray={`${px(5)} ${px(3)}`} />
          </g>,
        );
        overlay.push(changeTag(`gt-${id}`, b, e.tag, e.d, colour));
        return;
      }
      const p = byId.get(id);
      if (!p) return;
      const b = pieceBox(p.fp, p.place);
      if (e.tag !== 'MOVED') overlay.push(<rect key={`co-${id}`} data-changed={id} x={b.x - 0.1} y={b.y - 0.1} width={b.w + 0.2} height={b.h + 0.2} rx={0.12} fill="none" stroke={colour} strokeWidth={px(2.2)} pointerEvents="none" />);
      if (e.moved && e.was?.place) overlay.push(<line key={`cm-${id}`} x1={e.was.place.x} y1={e.was.place.y} x2={p.place.x} y2={p.place.y} stroke={colour} strokeWidth={px(1.5)} strokeDasharray={`${px(4)} ${px(3)}`} pointerEvents="none" />);
      overlay.push(changeTag(`ct-${id}`, b, e.tag, e.d, colour));
    });
  }
  function changeTag(key: string, b: { x: number; y: number }, tag: string, d: number, colour: string) {
    const txt = tag === 'MOVED' ? 'MOVED' : `${tag}${hideFigures || Math.abs(d) < 1 ? '' : ` ${d > 0 ? '+' : '−'}₹${shortInr(d)}`}`;
    const fs = px(9.5), w = txt.length * fs * 0.64 + px(10), h = fs + px(7);
    const ty = b.y - h - px(3);
    return (
      <g key={key} pointerEvents="none">
        <rect x={b.x} y={ty} width={w} height={h} rx={px(4)} fill={colour} />
        <text x={b.x + px(5)} y={ty + h - px(4.5)} fontSize={fs} fontWeight={800} fill="#fff">{txt}</text>
      </g>
    );
  }

  /* The picked room's walls: a handle on each, to pull the room to size (not while a civil tool is drawing). */
  const pickedRoom = !selected && selRoom && onRooms && !readOnly && !(civ && civilTool) ? planRooms.find(r => r.name === selRoom) : undefined;
  if (pickedRoom?.plan) {
    const p = pickedRoom.plan;
    (['left', 'right', 'top', 'bottom'] as RoomEdge[]).forEach(e => {
      const across = e === 'left' || e === 'right';
      const at = edgeAt(p, e);
      const cx = across ? at : p.x + p.w / 2, cy = across ? p.y + p.h / 2 : at;
      const long = px(26), thin = px(9);
      overlay.push(
        <rect key={`rh-${e}`} data-room-edge={e} x={cx - (across ? thin : long) / 2} y={cy - (across ? long : thin) / 2} width={across ? thin : long} height={across ? long : thin}
          rx={thin / 2} fill={BRAND} stroke="#fff" strokeWidth={px(2)} style={{ cursor: across ? 'ew-resize' : 'ns-resize' }}
          onPointerDown={ev => startRoom(ev, pickedRoom.name, e)} aria-label={`Move the ${e} wall of ${pickedRoom.name}`} />,
      );
    });
  }
  if (selected && !readOnly) {
    const W = selected.size.w, D = Math.max(selected.size.d, 0.12), pad = px(4), hr = px(6);
    const handles = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]].map(([sx, sy]) => {
      const cx = sx * (W / 2 + pad), cy = sy * (D / 2 + pad);
      const down = (e: React.PointerEvent) => startResize(e, selected, sx, sy);
      return sx && sy
        ? <rect key={`${sx},${sy}`} data-h={`${sx},${sy}`} x={cx - hr} y={cy - hr} width={hr * 2} height={hr * 2} rx={px(2)} fill="#fff" stroke={BRAND} strokeWidth={px(2)} style={{ cursor: sx * sy > 0 ? 'nwse-resize' : 'nesw-resize' }} onPointerDown={down} aria-label="Resize from the corner" />
        : <circle key={`${sx},${sy}`} data-h={`${sx},${sy}`} cx={cx} cy={cy} r={hr * 0.85} fill={BRAND} stroke="#fff" strokeWidth={px(2)} style={{ cursor: sx ? 'ew-resize' : 'ns-resize' }} onPointerDown={down} aria-label={`Resize from the ${sx < 0 ? 'left' : sx > 0 ? 'right' : sy < 0 ? 'back' : 'front'}`} />;
    });
    overlay.push(
      <g key="sel" transform={`translate(${selected.place.x} ${selected.place.y}) rotate(${selected.place.rot})`}>
        <rect x={-W / 2 - pad} y={-D / 2 - pad} width={W + pad * 2} height={D + pad * 2} rx={px(4)} fill="none" stroke={BRAND} strokeWidth={px(1.8)} pointerEvents="none" />
        <line x1={0} y1={-D / 2 - pad} x2={0} y2={-D / 2 - px(26)} stroke={BRAND} strokeWidth={px(1.5)} pointerEvents="none" />
        <circle data-rot="1" cx={0} cy={-D / 2 - px(30)} r={px(9)} fill="#fff" stroke={BRAND} strokeWidth={px(2)} style={{ cursor: 'grab' }} onPointerDown={e => startTurn(e, selected)} aria-label="Turn" />
        {handles}
      </g>,
    );
  } else if (selected) {
    const W = selected.size.w, D = Math.max(selected.size.d, 0.12), pad = px(4);
    overlay.push(
      <g key="sel" transform={`translate(${selected.place.x} ${selected.place.y}) rotate(${selected.place.rot})`} pointerEvents="none">
        <rect x={-W / 2 - pad} y={-D / 2 - pad} width={W + pad * 2} height={D + pad * 2} rx={px(4)} fill="none" stroke={BRAND} strokeWidth={px(1.8)} />
      </g>,
    );
  }

  /* The dark label above the selected piece: its size, quantity and amount, live while it changes. */
  let float: React.ReactNode = null;
  if (selected && selModel) {
    const b = pieceBox(selected.fp, selected.place);
    const [sx, sy] = toScreen(selected.place.x, b.y);
    const liveLine = drag && (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'turn') && drag.id === selected.id ? drag.live : null;
    const qty = liveLine ? Number(liveLine.qty) || 0 : selModel.qty;
    const amount = liveLine ? selModel.rate * qty : selModel.amount;
    const face = /sq\s*ft|sft|sqft/i.test(selModel.unit);
    float = (
      <div className="absolute z-30 pointer-events-none -translate-x-1/2" style={{ left: Math.max(90, Math.min(size.w - 90, sx)), top: Math.max(6, sy - 74) }}>
        <div className="rounded-xl bg-slate-800/95 text-white shadow-2xl px-3 py-1.5 text-xs whitespace-nowrap flex items-center gap-2">
          <b className="max-w-[140px] truncate">{selModel.name}</b>
          <span className="text-white/70">{face ? `${ftin(selected.size.w)} × ${ftin(selected.size.h)} = ` : ''}<b className="text-white">{Math.round(qty * 100) / 100} {selModel.unit}</b></span>
          {!hideFigures && <b className="tabular-nums">{selModel.billable ? inr(amount) : 'not billed'}</b>}
          {drag?.kind === 'turn' && <span className="px-1.5 rounded bg-white/15 font-bold">{Math.round(selected.place.rot)}°</span>}
        </div>
      </div>
    );
  }

  if (pulled && drag?.kind === 'room') {
    const r = rooms.find(x => x.name === drag.name);
    if (r?.plan) {
      const [sx, sy] = toScreen(r.plan.x + r.plan.w / 2, r.plan.y);
      float = (
        <div className="absolute z-30 pointer-events-none -translate-x-1/2" style={{ left: Math.max(90, Math.min(size.w - 90, sx)), top: Math.max(6, sy - 44) }}>
          <div className="rounded-xl bg-slate-800/95 text-white shadow-2xl px-3 py-1.5 text-xs whitespace-nowrap flex items-center gap-2">
            <b>{r.name}</b>
            <span className="text-white/70">{ftin(r.plan.w)} × {ftin(r.plan.h)} = <b className="text-white">{Math.round(r.plan.w * r.plan.h)} sq ft</b></span>
          </div>
        </div>
      );
    }
  }

  /* ── the Civil layer: room fills and tags, the walls broken and built, the one being drawn ── */
  const civilG: React.ReactNode[] = [];
  const civilLabels: React.ReactNode[] = [];
  if (civ) {
    const civLines = boq.filter(l => l.civil && l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted');
    const pill = (key: string, text: string, x: number, y: number, fill: string, centred = false) => {
      const fs = px(10), h = fs + px(6), w = text.length * fs * 0.64 + px(10);
      const x0 = centred ? x - w / 2 : x;
      return (
        <g key={key} pointerEvents="none">
          <rect x={x0} y={y} width={w} height={h} rx={px(4)} fill={fill} />
          <text x={centred ? x : x0 + px(5)} y={y + h - px(4.5)} fontSize={fs} fontWeight={800} fill="#fff" textAnchor={centred ? 'middle' : 'start'}>{text}</text>
        </g>
      );
    };
    planRooms.forEach(r => {
      const p = r.plan!;
      const has = (t: string) => civLines.some(l => l.roomId === r.name && l.civil!.type === t);
      const tags: [string, string][] = [];
      if (has('floor')) { civilG.push(<rect key={`cf-${r.name}`} x={p.x} y={p.y} width={p.w} height={p.h} fill="url(#pg-civ-floor)" pointerEvents="none" />); tags.push(['FLOOR', '#d97706']); }
      if (has('waterproof')) { civilG.push(<rect key={`cw-${r.name}`} x={p.x} y={p.y} width={p.w} height={p.h} fill="url(#pg-civ-waterproof)" pointerEvents="none" />); tags.push(['WATERPROOF', '#0284c7']); }
      if (has('walls7')) {
        civilG.push(<rect key={`ct-${r.name}`} x={p.x + 0.18} y={p.y + 0.18} width={Math.max(0, p.w - 0.36)} height={Math.max(0, p.h - 0.36)} fill="none" stroke="#3D52A0" strokeWidth={0.2} strokeDasharray=".5 .2" pointerEvents="none" />);
        tags.push(['WALL TILES', '#3D52A0']);
      }
      const h = px(16) + px(3);
      tags.forEach(([t, c], i) => civilLabels.push(pill(`tag-${r.name}-${t}`, t, p.x + px(6), p.y + px(6) + i * h, c)));
    });
    const segRect = (g: Segment) => {
      const t = 0.45;
      return g[1] === g[3] ? { x: g[0], y: g[1] - t / 2, w: g[2] - g[0], h: t } : { x: g[0] - t / 2, y: g[1], w: t, h: g[3] - g[1] };
    };
    civLines.filter(l => l.civil!.segment).forEach(l => {
      const g = l.civil!.segment!;
      const type = l.civil!.type as 'break' | 'build';
      const R = segRect(g);
      const on = sel === l.id;
      const colour = toolOf(type).colour;
      civilG.push(
        <g key={`cs-${l.id}`} data-civ={l.id} style={{ cursor: civilTool ? undefined : 'pointer' }}
          onPointerDown={e => { if (civilTool) return; e.stopPropagation(); onSel(l.id); onSelRoom(null); }}>
          <rect x={R.x} y={R.y} width={R.w} height={R.h} fill={`url(#pg-civ-${type})`} stroke={on ? BRAND : colour} strokeWidth={px(on ? 3 : 1.5)}
            strokeDasharray={type === 'break' ? `${px(5)} ${px(3)}` : undefined} />
        </g>,
      );
      const m = models.get(l.id);
      const text = `${type === 'break' ? 'BREAK' : 'NEW WALL'} ${ftin(segLength(g))} · ${Math.round(m?.qty ?? l.qty)} ${String(m?.unit || 'sq ft').toUpperCase()}`;
      civilLabels.push(pill(`cl-${l.id}`, text, (g[0] + g[2]) / 2, Math.min(g[1], g[3]) - px(24), colour, true));
    });
    if (drag?.kind === 'civdraw') {
      const room = props.rooms.find(r => r.name === drag.room);
      const g = room ? segmentFor(drag.tool, room, drag.a, drag.b) : null;
      if (g) {
        const R = segRect(g);
        civilG.push(<rect key="civ-draft" x={R.x} y={R.y} width={R.w} height={R.h} fill={`url(#pg-civ-${drag.tool})`} stroke={toolOf(drag.tool).colour} strokeWidth={px(2)} pointerEvents="none" />);
        civilLabels.push(pill('civ-draft-len', ftin(segLength(g)), (g[0] + g[2]) / 2, Math.min(g[1], g[3]) - px(24), '#1e293b', true));
      }
    }
  }

  const ground = { x: bounds.x - 200, y: bounds.y - 200, w: bounds.w + 400, h: bounds.h + 400 };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 select-none touch-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDragOver={onDragOver}
      onDragLeave={e => { if (e.currentTarget === e.target) setKitOver(null); }}
      onDrop={onDrop}
    >
      <svg className="absolute inset-0 w-full h-full" role="application" style={civ && civilTool ? { cursor: 'crosshair' } : undefined}
        aria-label="The flat. Drag furniture to move it; pull its handles to resize or turn it."
        onPointerDown={e => startPan(e, null)}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          <rect x={ground.x} y={ground.y} width={ground.w} height={ground.h} fill="url(#pg-dots)" />
          {underlay && (
            <image href={underlay.imageUrl} x={-(underlay.origin?.x || 0) * underlay.ftPerPx!} y={-(underlay.origin?.y || 0) * underlay.ftPerPx!}
              width={underlay.imagePx!.w * underlay.ftPerPx!} height={underlay.imagePx!.h * underlay.ftPerPx!} preserveAspectRatio="none" />
          )}
          {traced && <LinePlanRooms rooms={rooms} />}
          {planRooms.map(r => {
            const a = 0.02 + 0.12 * ((roomTotals.get(r.name) || 0) / maxRoom);
            return (
              <g key={r.name}>
                {!underlay && !traced && <rect x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="#f7f6f2" />}
                <rect data-room={r.name} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill={`rgba(61,82,160,${a})`}
                  onPointerDown={e => { e.stopPropagation(); startPan(e, r.name); }} />
                {fresh?.glow === r.name && <rect key={`glow-${fresh.key}`} className="pg-glow" data-glow={r.name} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill={BRAND} opacity={0} pointerEvents="none" />}
                {selRoom === r.name && <rect x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="none" stroke={BRAND} strokeWidth={px(2.5)} pointerEvents="none" />}
              </g>
            );
          })}
          {kitOver && (() => { const r = planRooms.find(x => x.name === kitOver); return r ? <rect x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill={BRAND} fillOpacity={0.12} stroke={BRAND} strokeWidth={px(2.5)} pointerEvents="none" data-kit-over={r.name} /> : null; })()}
          {/* No drawing under the plan: the rooms' walls, drawn as a plan would draw them. */}
          {!underlay && !traced && planRooms.map(r => (
            <rect key={`w-${r.name}`} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="none" stroke="#262626" strokeWidth={0.38} pointerEvents="none" />
          ))}
          {!underlay && !traced && bounds && planRooms.length > 0 && (() => {
            const b = boundsOf(planRooms.map(r => r.plan!))!;
            return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#262626" strokeWidth={0.7} pointerEvents="none" />;
          })()}
          {/* On the Civil layer the furniture fades back and cannot be picked. */}
          <g opacity={civ ? 0.22 : 1} pointerEvents={civ ? 'none' : undefined}>
            {pieces.map(p => (
              <PieceNode key={p.id} piece={p} faded={!models.get(p.id)?.billable} readOnly={readOnly} onDown={onPieceDown} drop={fresh?.drop.get(p.id)}
                fill={models.get(p.id)?.art.fill} base={models.get(p.id)?.art.base} top={models.get(p.id)?.art.top} />
            ))}
          </g>
          {civ && <g>{civilG}</g>}
          {ghosts.length > 0 && <g>{ghosts}</g>}
          {traced && <LinePlanLabels rooms={rooms} tagClearance={px(23)} tagged={roomHasLines} />}
          {traced && <LinePlanTitle rooms={rooms} title={planTitle} sub={planSub} />}
          <g>{tags}</g>
          {civ && <g>{civilLabels}</g>}
          <g>{overlay}</g>
          {drag?.kind === 'move' && drag.guides.map((g, i) => (
            <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={g.wall ? BRAND : '#64748b'} strokeDasharray={`${px(4)} ${px(3)}`} strokeWidth={px(1)} pointerEvents="none" />
          ))}
        </g>
      </svg>
      {float}
      {fresh?.tag && (() => {
        const p = pieces.find(x => x.id === fresh.tag!.id);
        if (!p) return null;
        return (
          <div key={`tag-${fresh.key}`} aria-hidden data-price-tag
            className={`pg-tag absolute z-40 px-2.5 py-1 rounded-full text-xs font-black tabular-nums shadow-lg text-white ${fresh.tag.up ? 'bg-emerald-600' : 'bg-rose-600'}`}
            style={{ left: view.tx + p.place.x * view.k, top: view.ty + p.place.y * view.k - 12 }}>
            {fresh.tag.text}
          </div>
        );
      })()}
      <div className="absolute -translate-x-1/2 bottom-2.5 rounded-xl bg-white/95 border border-slate-200 shadow-lg px-1.5 py-1 flex items-center gap-1"
        style={{ left: `calc(50% + ${libOpen ? 122 : 0}px)` }} onPointerDown={e => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out" className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"><Minus className="w-3.5 h-3.5" aria-hidden /></button>
        <button type="button" onClick={fit} aria-label="Fit the plan" className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"><Maximize className="w-3.5 h-3.5" aria-hidden /></button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"><Plus className="w-3.5 h-3.5" aria-hidden /></button>
      </div>
    </div>
  );
}

/* ── one piece ── */

const PieceNode = React.memo(function PieceNode({ piece, faded, readOnly, onDown, fill, base, top, drop }: {
  piece: BoardPiece; faded: boolean; readOnly: boolean; fill?: string; base?: string; top?: string;
  /** Just dropped onto the plan: its place in the stagger (PR 7). */
  drop?: number;
  onDown: (e: React.PointerEvent, p: BoardPiece) => void;
}) {
  stageStats.pieceRenders++;
  const { place, size, draw } = piece;
  return (
    <g data-piece={piece.id} transform={`translate(${place.x} ${place.y}) rotate(${place.rot})`} onPointerDown={e => onDown(e, piece)}
      style={{ cursor: readOnly ? 'pointer' : 'move' }} aria-label={`${piece.item?.name || 'Piece'}, ${ftin(size.w)} wide`}>
      <g className={drop != null ? 'pg-drop' : undefined} style={drop != null ? { animationDelay: `${drop * 110}ms` } : undefined}>
        <PieceArt kind={draw.kind} w={size.w} d={size.d} words={piece.line.specs ?? piece.item?.specs} high={draw.mount === 'high'} faded={faded} fill={fill} base={base} top={top} />
      </g>
    </g>
  );
});
