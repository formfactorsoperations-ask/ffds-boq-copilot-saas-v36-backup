import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize } from 'lucide-react';
import type { ProjectContext, Item, BoqItem, Room } from '../../types';
import { boardPieces, drawOf, isHigh, isWallBacked, pieceSize, footprintOf, pieceItemOf, type BoardPiece } from '../../lib/playground/pieces';
import { placeAt, softSnap, type PlacedPiece, type SnapGuide, type PlanRoom } from '../../lib/playground/placing';
import { boundsOf, ftin, normRot, pieceBox } from '../../lib/playground/geometry';
import { lineIssues } from '../../lib/playground/issues';
import { sheetOf, isPdfSheet } from '../../lib/playground/planSheet';
import { newPieceLine, movedLine, resizedFromEdge, type Edge } from '../../lib/playground/board';
import { resizeRoom, edgeAt, type RoomEdge, type RoomResize } from '../../lib/playground/roomEdges';
import { PieceArt } from './pieceArt';
import { inr, lakh, type LineModel } from './playgroundUi';

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
}

type Drag =
  | { kind: 'move'; id: string; offset: [number, number]; start: BoqItem; live: BoqItem; room: string | null; guides: SnapGuide[] }
  | { kind: 'resize'; id: string; sx: number; sy: number; from: [number, number]; start: BoqItem; live: BoqItem }
  | { kind: 'turn'; id: string; start: BoqItem; live: BoqItem }
  | { kind: 'pan'; from: [number, number]; view: View; room: string | null }
  | { kind: 'room'; name: string; edge: RoomEdge; live: RoomResize | null };

/** Counts piece redraws, so a test can hold a drag to one piece per frame. */
export const stageStats = { pieceRenders: 0 };

export default function PlanStage(props: Props) {
  const { ctx, bank, bankMap, models, roomTotals, readOnly, sel, onSel, selRoom, onSelRoom, commit, newId, libOpen, hideFigures, fitSignal, prepareNew, onRooms } = props;
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
  const underlay = sheet?.imageUrl && Number(sheet.ftPerPx) > 0 && sheet.imagePx && !isPdfSheet(sheet) ? sheet : null;

  /* The pieces from the BOQ; while dragging only the dragged one is swapped in. */
  const basePieces = useMemo(() => boardPieces(boq, bankMap), [boq, bankMap]);
  const livePiece = useMemo(() => (drag && drag.kind !== 'pan' && drag.kind !== 'room' ? boardPieces([drag.live], bankMap)[0] : undefined), [drag, bankMap]);
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
    return boundsOf(rects) || { x: 0, y: 0, w: 30, h: 20 };
  }, [planRooms, underlay]);

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
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const item = bank.find(i => i.id === e.dataTransfer.getData('text/plain'));
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
  const startPan = (e: React.PointerEvent, room: string | null) => {
    panMoved.current = false;
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'pan', from: [e.clientX, e.clientY], view, room });
  };

  const liveFor = (d: Drag, at: [number, number], alt: boolean, shift: boolean): Drag => {
    if (d.kind === 'pan') return d;
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

  const tags = planRooms.map(r => {
    const room = rooms.find(x => x.name === r.name)!;
    const price = roomTotals.get(r.name) || 0;
    const has = price > 0 || boq.some(l => l.roomId === r.name);
    const narrow = r.plan!.w < 6 || tight;
    const name = (narrow && room.name.length > 10 ? room.name.split(/\s+/)[0] : room.name).toUpperCase();
    const pr = !has ? 'Empty' : hideFigures ? '' : narrow ? lakh(price).replace(' L', 'L') : inr(price);
    const fn = px(10), fp = px(14);
    const w = Math.max(name.length * fn * 0.68, pr.length * fp * 0.6) + px(14);
    const h = (pr ? fn + fp : fn) + px(14);
    const cx = r.plan!.x + r.plan!.w / 2, cy = r.plan!.y + r.plan!.h / 2;
    return (
      <g key={r.name} pointerEvents="none">
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={px(8)} fill="#fff" fillOpacity={0.94} stroke={selRoom === r.name ? BRAND : '#e2e8f0'} strokeWidth={px(1)} filter="url(#pg-sh2)" />
        <text x={cx} y={cy - h / 2 + px(6) + fn * 0.85} fontSize={fn} fontWeight={700} fill="#64748b" textAnchor="middle">{name}</text>
        {pr && <text x={cx} y={cy + h / 2 - px(6)} fontSize={fp} fontWeight={800} fill={has ? '#1e293b' : '#94a3b8'} textAnchor="middle">{pr}</text>}
      </g>
    );
  });

  const overlay: React.ReactNode[] = [];
  pieces.forEach(p => {
    if (p.id === sel || !flagged.has(p.id)) return;
    const b = pieceBox(p.fp, p.place);
    overlay.push(<rect key={`f-${p.id}`} x={b.x - 0.06} y={b.y - 0.06} width={b.w + 0.12} height={b.h + 0.12} rx={0.1} fill="rgba(245,158,11,.08)" stroke="#d97706" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(3)}`} pointerEvents="none" />);
  });
  /* A line on an older version of a material: the amber mark the mockup puts at the piece's corner. */
  pieces.forEach(p => {
    if (p.id === sel || !models.get(p.id)?.stale.length) return;
    const b = pieceBox(p.fp, p.place);
    overlay.push(
      <g key={`s-${p.id}`} pointerEvents="none">
        <circle cx={b.x + b.w} cy={b.y} r={px(7)} fill="#f59e0b" stroke="#fff" strokeWidth={px(2)} />
        <text x={b.x + b.w} y={b.y + px(3.5)} fontSize={px(10)} fontWeight={800} fill="#fff" textAnchor="middle">!</text>
      </g>,
    );
  });
  /* The picked room's walls: a handle on each, to pull the room to size. */
  const pickedRoom = !selected && selRoom && onRooms && !readOnly ? planRooms.find(r => r.name === selRoom) : undefined;
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
    const liveLine = drag && drag.kind !== 'pan' && drag.kind !== 'room' && drag.id === selected.id ? drag.live : null;
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

  const ground = { x: bounds.x - 200, y: bounds.y - 200, w: bounds.w + 400, h: bounds.h + 400 };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 select-none touch-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDragOver={e => { if (!readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={onDrop}
    >
      <svg className="absolute inset-0 w-full h-full" role="application"
        aria-label="The flat. Drag furniture to move it; pull its handles to resize or turn it."
        onPointerDown={e => startPan(e, null)}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          <rect x={ground.x} y={ground.y} width={ground.w} height={ground.h} fill="url(#pg-dots)" />
          {underlay && (
            <image href={underlay.imageUrl} x={-(underlay.origin?.x || 0) * underlay.ftPerPx!} y={-(underlay.origin?.y || 0) * underlay.ftPerPx!}
              width={underlay.imagePx!.w * underlay.ftPerPx!} height={underlay.imagePx!.h * underlay.ftPerPx!} preserveAspectRatio="none" />
          )}
          {planRooms.map(r => {
            const a = 0.02 + 0.12 * ((roomTotals.get(r.name) || 0) / maxRoom);
            return (
              <g key={r.name}>
                {!underlay && <rect x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="#f7f6f2" />}
                <rect data-room={r.name} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill={`rgba(61,82,160,${a})`}
                  onPointerDown={e => { e.stopPropagation(); startPan(e, r.name); }} />
                {selRoom === r.name && <rect x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="none" stroke={BRAND} strokeWidth={px(2.5)} pointerEvents="none" />}
              </g>
            );
          })}
          {/* No drawing under the plan: the rooms' walls, drawn as a plan would draw them. */}
          {!underlay && planRooms.map(r => (
            <rect key={`w-${r.name}`} x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="none" stroke="#262626" strokeWidth={0.38} pointerEvents="none" />
          ))}
          {!underlay && bounds && planRooms.length > 0 && (() => {
            const b = boundsOf(planRooms.map(r => r.plan!))!;
            return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#262626" strokeWidth={0.7} pointerEvents="none" />;
          })()}
          {pieces.map(p => (
            <PieceNode key={p.id} piece={p} faded={!models.get(p.id)?.billable} readOnly={readOnly} onDown={onPieceDown}
              fill={models.get(p.id)?.art.fill} base={models.get(p.id)?.art.base} top={models.get(p.id)?.art.top} />
          ))}
          <g>{tags}</g>
          <g>{overlay}</g>
          {drag?.kind === 'move' && drag.guides.map((g, i) => (
            <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={g.wall ? BRAND : '#64748b'} strokeDasharray={`${px(4)} ${px(3)}`} strokeWidth={px(1)} pointerEvents="none" />
          ))}
        </g>
      </svg>
      {float}
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

const PieceNode = React.memo(function PieceNode({ piece, faded, readOnly, onDown, fill, base, top }: {
  piece: BoardPiece; faded: boolean; readOnly: boolean; fill?: string; base?: string; top?: string;
  onDown: (e: React.PointerEvent, p: BoardPiece) => void;
}) {
  stageStats.pieceRenders++;
  const { place, size, draw } = piece;
  return (
    <g data-piece={piece.id} transform={`translate(${place.x} ${place.y}) rotate(${place.rot})`} onPointerDown={e => onDown(e, piece)}
      style={{ cursor: readOnly ? 'pointer' : 'move' }} aria-label={`${piece.item?.name || 'Piece'}, ${ftin(size.w)} wide`}>
      <PieceArt kind={draw.kind} w={size.w} d={size.d} words={piece.line.specs ?? piece.item?.specs} high={draw.mount === 'high'} faded={faded} fill={fill} base={base} top={top} />
    </g>
  );
});
