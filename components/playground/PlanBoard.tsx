import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PenTool, Undo2, Redo2, RotateCcw, RotateCw, Trash2, Search, Plus, MapPin, AlertTriangle, Lock } from 'lucide-react';
import { Panel, Button, Chip, EmptyState, LABEL, INPUT } from '../ui/kit';
import type { ProjectContext, ProposalTier, Item, BoqItem, Room } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { realRooms } from '../../lib/scopeBuckets';
import { boardPieces, drawOf, isHigh, isWallBacked, pieceSize, footprintOf, type BoardPiece } from '../../lib/playground/pieces';
import { autoPlace, placeAt, softSnap, type PlacedPiece, type SnapGuide } from '../../lib/playground/placing';
import { boundsOf, ftin, roomRect, round2 } from '../../lib/playground/geometry';
import { lineIssues, ISSUE_LABEL } from '../../lib/playground/issues';
import { lineAmount, pricingRulesOf } from '../../lib/playground/pricing';
import { sheetOf, isPdfSheet } from '../../lib/playground/planSheet';
import {
  newPieceLine, movedLine, turnedLine, nudgedLine, resizedFromEdge, resizedTo, needsPlace, drawableItems,
  pushHistory, undoHistory, redoHistory, screenToPlan, type Edge, type History,
} from '../../lib/playground/board';

/*
  Drawing on the plan (BOQ Playground PR 3b), the Plan lens's board.

  Pieces are BOQ lines with a place. Drag an item from the library onto a room
  and it becomes a line there, sized and priced; drag a piece to move it (the
  magnets pull it onto walls and its neighbours' edges; Alt places it freely),
  drag an edge to resize it (its quantity follows), turn it, nudge it with the
  arrow keys. Every drag has a typed route: the inspector takes the position,
  turn and size as numbers, and the library's Add places an item in a room.

  The Live BOQ beside it is the same BOQ the Sheet and Rooms lenses edit, so a
  change on the plan shows there at once, and the other way round. Overlaps
  and pieces past a wall are flagged. One drag is one undo.

  A frozen BOQ, or the signed version, is shown and cannot be changed.

  Speed: a drag redraws only the piece being dragged (each piece is memoised
  on its line), and writes the BOQ once, when the pointer is let go.
*/

const BRAND = '#3D52A0';
const ROSE = '#be123c';

interface Props {
  projectContext: ProjectContext;
  tier: ProposalTier;
  bank: Item[];
  bankMap: Map<string, Item>;
  readOnly: boolean;
  /** Writes the option's BOQ. */
  onBoq: (next: BoqItem[]) => void;
  newId: () => string;
}

type Drag =
  | { kind: 'move'; id: string; offset: [number, number]; start: BoqItem; live: BoqItem; room: string | null; guides: SnapGuide[] }
  | { kind: 'resize'; id: string; edge: Edge; from: [number, number]; start: BoqItem; live: BoqItem };

/** Counts piece redraws, so a test can hold a drag to one piece per frame. */
export const boardStats = { pieceRenders: 0 };

export default function PlanBoard({ projectContext: ctx, tier, bank, bankMap, readOnly, onBoq, newId }: Props) {
  const boq = tier.boq || [];
  const rooms: Room[] = useMemo(() => realRooms(ctx.rooms || []).filter(r => roomRect(r)), [ctx.rooms]);
  const rules = pricingRulesOf(tier);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hist, setHist] = useState<History<BoqItem[]>>({ past: [], future: [] });
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<string>('');
  const [note, setNote] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frame = useRef<number | null>(null);

  /* The board's lines: the BOQ, with the line being dragged as it is now. */
  const lines = useMemo(() => (drag ? boq.map(l => (l.id === drag.id ? drag.live : l)) : boq), [boq, drag]);
  /*
    The pieces come from the BOQ once; while dragging, only the dragged one is
    swapped in, so every other piece keeps its object and its memoised drawing.
  */
  const basePieces = useMemo(() => boardPieces(boq, bankMap), [boq, bankMap]);
  const livePiece = useMemo(() => (drag ? boardPieces([drag.live], bankMap)[0] : undefined), [drag, bankMap]);
  const pieces = useMemo(
    () => (livePiece ? basePieces.map(p => (p.id === livePiece.id ? livePiece : p)) : basePieces),
    [basePieces, livePiece],
  );
  const pieceById = useMemo(() => new Map(pieces.map(p => [p.id, p])), [pieces]);
  const planRooms = useMemo(() => rooms.map(r => ({ name: r.name, plan: r.plan })), [rooms]);
  const waiting = useMemo(() => needsPlace(boq, bankMap), [boq, bankMap]);
  const library = useMemo(() => drawableItems(bank).filter(x => !q.trim() || x.item.name.toLowerCase().includes(q.trim().toLowerCase())), [bank, q]);
  const selected = sel ? pieceById.get(sel) : undefined;
  const selLine = sel ? lines.find(l => l.id === sel) : undefined;

  const issuesOf = useCallback((id: string) => {
    const line = lines.find(l => l.id === id);
    return line ? lineIssues(line, { bankMap, pieces, rooms: planRooms }).filter(k => k === 'overlap') : [];
  }, [lines, bankMap, pieces, planRooms]);
  /* Overlaps are worked out when a gesture ends, not on every frame of it. */
  const flagged = useMemo(() => new Set(basePieces.filter(p =>
    lineIssues(p.line, { bankMap, pieces: basePieces, rooms: planRooms }).includes('overlap')).map(p => p.id)),
  [basePieces, bankMap, planRooms]);

  /* The view: the rooms, the drawing under them when it is to scale, and a margin. */
  const sheet = sheetOf(ctx);
  const underlay = sheet?.imageUrl && Number(sheet.ftPerPx) > 0 && sheet.imagePx && !isPdfSheet(sheet) ? sheet : null;
  const view = useMemo(() => {
    const rects = rooms.map(r => r.plan!);
    if (underlay) {
      const k = underlay.ftPerPx!, o = underlay.origin || { x: 0, y: 0 };
      rects.push({ x: -o.x * k, y: -o.y * k, w: underlay.imagePx!.w * k, h: underlay.imagePx!.h * k });
    }
    const b = boundsOf(rects) || { x: 0, y: 0, w: 30, h: 20 };
    return { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
  }, [rooms, underlay]);

  /* ── writing, with undo ── */

  const commit = useCallback((next: BoqItem[], msg?: string) => {
    setHist(h => pushHistory(h, boq));
    onBoq(next);
    setNote(msg || null);
  }, [boq, onBoq]);
  const replace = (line: BoqItem, msg?: string) => commit(boq.map(l => (l.id === line.id ? line : l)), msg);
  const undo = () => { const r = undoHistory(hist, boq); if (r) { setHist(r.h); onBoq(r.state); setNote('Undone.'); } };
  const redo = () => { const r = redoHistory(hist, boq); if (r) { setHist(r.h); onBoq(r.state); setNote('Redone.'); } };

  const pt = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return screenToPlan(e.clientX, e.clientY, r, view);
  };
  /* About 9 screen pixels, in feet at the current size: the magnets' reach. */
  const reach = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width ? (9 * view.w) / r.width : 0.5;
  };

  const asPlaced = (line: BoqItem): PlacedPiece | null => {
    const item = bankMap.get(line.bankId);
    const draw = drawOf(item);
    if (!draw || !line.place) return null;
    return { id: line.id, room: line.roomId, fp: footprintOf(pieceSize(line, item, draw)), place: line.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };

  /* ── adding from the library ── */

  const addAt = (item: Item, x: number, y: number, free: boolean) => {
    const draw = drawOf(item);
    if (!draw) return;
    const probe: PlacedPiece = { id: '__new', fp: { w: draw.w, d: draw.d }, place: { x, y, rot: 0 }, high: isHigh(draw), wallBacked: isWallBacked(draw) };
    const at = placeAt(probe, x, y, planRooms, { free });
    const line = newPieceLine(item, at.room, at.place, newId());
    if (!line) return;
    commit([...boq, line], `${item.name} added${at.room ? ` to ${at.room}` : ''}.`);
    setSel(line.id);
  };
  const addToRoom = (item: Item, roomName: string) => {
    const room = planRooms.find(r => r.name === roomName);
    const draw = drawOf(item);
    if (!room || !draw) return;
    const probe: PlacedPiece = { id: '__new', fp: { w: draw.w, d: draw.d }, place: { x: 0, y: 0, rot: 0 }, high: isHigh(draw), wallBacked: isWallBacked(draw) };
    const others = pieces.filter(p => p.room === roomName);
    const at = autoPlace(probe, room, others);
    if (!at) { setNote(`${item.name} does not fit along a free wall in ${roomName}. Drag it in instead.`); return; }
    const line = newPieceLine(item, roomName, at, newId());
    if (!line) return;
    commit([...boq, line], `${item.name} added to ${roomName}.`);
    setSel(line.id);
  };
  const placeWaiting = (line: BoqItem) => {
    const room = planRooms.find(r => r.name === line.roomId);
    const item = bankMap.get(line.bankId);
    const draw = drawOf(item);
    if (!room || !draw) { setNote(`${line.roomId || 'Its room'} is not on the plan yet.`); return; }
    const size = pieceSize(line, item, draw);
    const probe: PlacedPiece = { id: line.id, fp: footprintOf(size), place: { x: 0, y: 0, rot: 0 }, high: isHigh(draw), wallBacked: isWallBacked(draw) };
    const at = autoPlace(probe, room, pieces.filter(p => p.room === room.name));
    if (!at) { setNote(`${item?.name || 'It'} does not fit along a free wall in ${room.name}.`); return; }
    replace({ ...line, place: { x: at.x, y: at.y, rot: at.rot, depthFt: size.d } }, `${item?.name || 'Piece'} placed in ${room.name}.`);
    setSel(line.id);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const id = e.dataTransfer.getData('text/plain');
    const item = bank.find(i => i.id === id);
    const p = pt(e);
    if (item && p) addAt(item, p[0], p[1], e.altKey);
  };

  /* ── dragging pieces ── */

  const startMove = (e: React.PointerEvent, p: BoardPiece) => {
    e.stopPropagation();
    setSel(p.id);
    if (readOnly) return;
    const at = pt(e);
    if (!at) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'move', id: p.id, offset: [at[0] - p.place.x, at[1] - p.place.y], start: p.line, live: p.line, room: p.room || null, guides: [] });
  };
  const startResize = (e: React.PointerEvent, p: BoardPiece, edge: Edge) => {
    e.stopPropagation();
    if (readOnly) return;
    const at = pt(e);
    if (!at) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ kind: 'resize', id: p.id, edge, from: at, start: p.line, live: p.line });
  };
  /* Where the dragged line is for a pointer position: snapped while moving, sized while resizing. */
  const liveFor = (d: Drag, at: [number, number], alt: boolean): Drag => {
    if (d.kind === 'move') {
      const me = asPlaced(d.start)!;
      const s = softSnap(me, at[0] - d.offset[0], at[1] - d.offset[1], planRooms, pieces.filter(p => p.id !== d.id), { thresholdFt: reach(), free: alt });
      const room = planRooms.find(r => r.plan && at[0] >= r.plan.x && at[0] <= r.plan.x + r.plan.w && at[1] >= r.plan.y && at[1] <= r.plan.y + r.plan.h);
      return { ...d, live: movedLine(d.start, { x: s.x, y: s.y, rot: d.start.place!.rot }, room ? room.name : null), room: room ? room.name : null, guides: s.guides };
    }
    const rot = (d.start.place!.rot * Math.PI) / 180;
    const dx = at[0] - d.from[0], dy = at[1] - d.from[1];
    const along = d.edge === 'left' || d.edge === 'right';
    // The pointer's travel, measured along the piece's own width or depth.
    const amount = along ? dx * Math.cos(rot) + dy * Math.sin(rot) : -dx * Math.sin(rot) + dy * Math.cos(rot);
    const signed = d.edge === 'left' || d.edge === 'back' ? -amount : amount;
    return { ...d, live: resizedFromEdge(d.start, bankMap.get(d.start.bankId), d.edge, signed) };
  };
  const last = useRef<{ at: [number, number]; alt: boolean } | null>(null);

  /* At most one redraw a frame; the drawn piece is the only one that changes. */
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const at = pt(e);
    if (!at) return;
    last.current = { at, alt: e.altKey };
    if (frame.current != null) return;
    const step = () => {
      frame.current = null;
      const l = last.current;
      if (l) setDrag(d => (d ? liveFor(d, l.at, l.alt) : d));
    };
    frame.current = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(step) : (step(), null);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const end = last.current;
    last.current = null;
    const d = end ? liveFor(drag, end.at, end.alt) : drag;
    setDrag(null);
    if (d.live === d.start) return;
    if (d.kind === 'move') {
      // Let go near a wall: backed onto it, unless Alt.
      const me = asPlaced(d.live)!;
      const at = placeAt(me, d.live.place!.x, d.live.place!.y, planRooms, { free: e.altKey || !!end?.alt });
      const moved = movedLine(d.start, at.place, at.room || d.room);
      replace(moved, at.room && at.room !== d.start.roomId ? `Moved to ${at.room}.` : undefined);
    } else {
      replace(d.live);
    }
  };

  /* Stable handlers, so a piece's memoised drawing is not redrawn for a new function. */
  const handlers = useRef({ startMove, startResize });
  handlers.current = { startMove, startResize };
  const onPieceDown = useCallback((e: React.PointerEvent, p: BoardPiece) => handlers.current.startMove(e, p), []);
  const onPieceEdge = useCallback((e: React.PointerEvent, p: BoardPiece, edge: Edge) => handlers.current.startResize(e, p, edge), []);

  /* ── keys ── */

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!selLine || readOnly) { if (e.key === 'Escape') setSel(null); return; }
    const step = e.shiftKey ? 1 : 0.25;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      replace(nudgedLine(selLine, k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0));
    } else if (k === 'r' || k === 'R') {
      e.preventDefault(); replace(turnedLine(selLine, e.shiftKey ? -90 : 90));
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault(); removeLine(selLine);
    } else if (k === 'Escape') {
      setSel(null);
    }
  };
  const removeLine = (line: BoqItem) => {
    commit(boq.filter(l => l.id !== line.id), `${bankMap.get(line.bankId)?.name || 'Line'} deleted. Undo puts it back.`);
    setSel(null);
  };
  const takeOff = (line: BoqItem) => {
    const { place: _p, ...rest } = line;
    replace(rest as BoqItem, 'Taken off the plan; the line stays in the BOQ, under Needs a place.');
    setSel(null);
  };

  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);

  /* ── the Live BOQ: what is on the plan, by room, as the client is charged ── */

  const live = useMemo(() => {
    const byRoom = new Map<string, { line: BoqItem; amount: number }[]>();
    lines.filter(l => l.place).forEach(l => {
      const room = l.roomId || 'Not in a room';
      byRoom.set(room, [...(byRoom.get(room) || []), { line: l, amount: lineAmount(l, bankMap, { rules }) }]);
    });
    return Array.from(byRoom.entries()).map(([room, ls]) => ({ room, lines: ls, total: ls.reduce((a, x) => a + x.amount, 0) }));
  }, [lines, bankMap, rules]);
  const liveTotal = live.reduce((a, r) => a + r.total, 0);

  if (!rooms.length) {
    return (
      <Panel icon={PenTool} title="Draw" blurb="Pieces on the plan, priced as you place them." className="mb-6">
        <EmptyState icon={MapPin} title="No rooms on the plan yet" text="Put the rooms on the plan below (read them off the drawing, trace them, or lay them out as blocks), then draw here." />
      </Panel>
    );
  }

  const unit = Math.max(view.w, view.h) / 110;
  const roomOptions = planRooms.map(r => r.name);
  const addRoom = target && roomOptions.includes(target) ? target : (selected?.room && roomOptions.includes(selected.room) ? selected.room : roomOptions[0]);

  return (
    <Panel
      icon={PenTool}
      title="Draw"
      className="mb-6"
      badge={<>
        {readOnly && <Chip tone="slate">Read-only</Chip>}
        {flagged.size > 0 && <Chip tone="bad">{flagged.size} overlap{flagged.size === 1 ? '' : 's'} or past a wall</Chip>}
        {waiting.length > 0 && <Chip tone="warn">{waiting.length} need a place</Chip>}
      </>}
      blurb={readOnly
        ? 'This BOQ is frozen or signed, so the plan is shown as it is. Start a revision to change it.'
        : 'Drag an item onto a room. Drag a piece to move it, an edge to resize it; R turns it, arrows nudge it, Alt places it freely.'}
      aside={!readOnly ? <>
        <Button size="sm" variant="quiet" icon={Undo2} onClick={undo} disabled={!hist.past.length} aria-label="Undo" title="Undo (Ctrl+Z)" />
        <Button size="sm" variant="quiet" icon={Redo2} onClick={redo} disabled={!hist.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" />
      </> : <Lock className="w-4 h-4 text-slate-400" aria-hidden />}
    >
      <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr_280px] gap-4">
        {/* Library */}
        {!readOnly ? (
          <div className="min-w-0">
            <span className={`${LABEL} block mb-1.5`}>Library</span>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
              <input className={`${INPUT} pl-8`} placeholder="Find an item" value={q} onChange={e => setQ(e.target.value)} aria-label="Find an item to draw" />
            </div>
            <label htmlFor="board-target" className={`${LABEL} block mb-1.5`}>Add to</label>
            <select id="board-target" className={`${INPUT} mb-2`} value={addRoom} onChange={e => setTarget(e.target.value)}>
              {roomOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {library.map(({ item, draw }) => (
                <div key={item.id} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  className="px-3 py-2 flex items-center gap-2 cursor-grab hover:bg-slate-50" title="Drag onto a room">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 truncate">{item.name}</span>
                    <span className="block text-[11px] text-slate-500">{ftin(draw.w)} × {ftin(draw.d)} · {item.unit}</span>
                  </span>
                  <Button size="sm" variant="quiet" icon={Plus} onClick={() => addToRoom(item, addRoom)} aria-label={`Add ${item.name} to ${addRoom}`} title={`Add to ${addRoom}`} />
                </div>
              ))}
              {library.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No item in the bank draws by that name.</p>}
            </div>
          </div>
        ) : <div className="hidden xl:block" />}

        {/* The board */}
        <div className="min-w-0">
          <svg
            ref={svgRef}
            role="application"
            aria-label="The plan, with its pieces"
            tabIndex={0}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className="block w-full h-auto rounded-xl border border-slate-200 bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 select-none touch-none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerDown={() => setSel(null)}
            onDragOver={e => { if (!readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={onDrop}
            onKeyDown={onKey}
          >
            {underlay && (
              <image href={underlay.imageUrl} x={-(underlay.origin?.x || 0) * underlay.ftPerPx!} y={-(underlay.origin?.y || 0) * underlay.ftPerPx!}
                width={underlay.imagePx!.w * underlay.ftPerPx!} height={underlay.imagePx!.h * underlay.ftPerPx!} opacity={0.35} preserveAspectRatio="none" />
            )}
            {rooms.map(r => (
              <g key={r.name}>
                <rect x={r.plan!.x} y={r.plan!.y} width={r.plan!.w} height={r.plan!.h} fill="#f8fafc" fillOpacity={underlay ? 0.4 : 1} stroke="#334155" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {/* Bottom-left: pieces mostly stand along the top and side walls. */}
                <text x={r.plan!.x + unit * 0.8} y={r.plan!.y + r.plan!.h - unit * 0.9} fontSize={unit * 1.4} fontWeight={700} fill="#475569">{r.name}</text>
              </g>
            ))}
            {pieces.map(p => (
              <PieceShape key={p.id} piece={p} selected={p.id === sel} flagged={flagged.has(p.id)} unit={unit} readOnly={readOnly}
                onDown={onPieceDown} onEdge={onPieceEdge} />
            ))}
            {drag?.kind === 'move' && drag.guides.map((g, i) => (
              <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={g.wall ? BRAND : '#64748b'} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {note && <p role="status" className="mt-2 text-xs text-slate-600">{note}</p>}

          {waiting.length > 0 && (
            <div className="mt-3">
              <span className={`${LABEL} block mb-1.5`}>Needs a place</span>
              <div className="flex flex-wrap gap-2">
                {waiting.map(l => (
                  <Button key={l.id} size="sm" icon={MapPin} disabled={readOnly} onClick={() => placeWaiting(l)}>
                    {bankMap.get(l.bankId)?.name || 'Piece'}{l.roomId ? ` · ${l.roomId}` : ''}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Inspector, then the Live BOQ */}
        <div className="min-w-0 space-y-4">
          {selected && selLine && (
            <div key={selected.id}>
            <PieceInspector
              piece={selected}
              line={selLine}
              item={bankMap.get(selLine.bankId)}
              amount={lineAmount(selLine, bankMap, { rules })}
              issues={issuesOf(selected.id)}
              rooms={roomOptions}
              readOnly={readOnly}
              onChange={next => replace(next)}
              onTurn={by => replace(turnedLine(selLine, by))}
              onTakeOff={() => takeOff(selLine)}
              onDelete={() => removeLine(selLine)}
            />
            </div>
          )}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className={LABEL}>Live BOQ</span>
              <span className="text-xs font-black text-slate-800 tabular-nums">{formatCurrency(Math.round(liveTotal))}</span>
            </div>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {live.map(r => (
                <div key={r.room} className="px-3 py-2">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-slate-800">{r.room}</span>
                    <span className="font-bold text-slate-800 tabular-nums">{formatCurrency(Math.round(r.total))}</span>
                  </div>
                  {r.lines.map(({ line, amount }) => (
                    <button key={line.id} type="button" onClick={() => setSel(line.id)}
                      className={`w-full mt-1 flex items-baseline justify-between gap-2 text-[11px] text-left rounded-md px-1 ${line.id === sel ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <span className="truncate">{bankMap.get(line.bankId)?.name || 'Line'} · {line.qty} {bankMap.get(line.bankId)?.unit || ''}</span>
                      <span className="tabular-nums shrink-0">{formatCurrency(Math.round(amount))}</span>
                    </button>
                  ))}
                </div>
              ))}
              {live.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Nothing on the plan yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ── one piece ── */

const PieceShape = React.memo(function PieceShape({ piece, selected, flagged, unit, readOnly, onDown, onEdge }: {
  piece: BoardPiece; selected: boolean; flagged: boolean; unit: number; readOnly: boolean;
  onDown: (e: React.PointerEvent, p: BoardPiece) => void;
  onEdge: (e: React.PointerEvent, p: BoardPiece, edge: Edge) => void;
}) {
  boardStats.pieceRenders++;
  const { place, size, draw } = piece;
  const w = size.w, d = Math.max(size.d, 0.12);
  const high = draw.mount === 'high';
  const stroke = flagged ? ROSE : BRAND;
  const handle = (edge: Edge, x: number, y: number) => (
    <circle key={edge} cx={x} cy={y} r={unit * 0.55} fill="#ffffff" stroke={BRAND} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
      className="cursor-ew-resize" onPointerDown={e => onEdge(e, piece, edge)} aria-label={`Resize from the ${edge}`} />
  );
  return (
    <g transform={`translate(${place.x} ${place.y}) rotate(${place.rot})`} onPointerDown={e => onDown(e, piece)}
      className={readOnly ? '' : 'cursor-move'} aria-label={`${piece.item?.name || 'Piece'}, ${ftin(w)} wide`}>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={BRAND} fillOpacity={selected ? 0.22 : 0.12}
        stroke={stroke} strokeWidth={selected || flagged ? 2.5 : 1.25} strokeDasharray={high ? '5 3' : undefined} vectorEffect="non-scaling-stroke" />
      {/* The front: the side a person stands at. */}
      <line x1={-w / 2} y1={d / 2} x2={w / 2} y2={d / 2} stroke={stroke} strokeWidth={selected ? 3 : 2} vectorEffect="non-scaling-stroke" />
      <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(unit * 1.1, d * 0.6, w / 6)} fill="#1e293b" transform={place.rot === 180 ? 'rotate(180)' : undefined}>
        {piece.item?.name || 'Piece'}
      </text>
      {selected && !readOnly && <>
        {handle('left', -w / 2, 0)}{handle('right', w / 2, 0)}{handle('front', 0, d / 2)}{handle('back', 0, -d / 2)}
      </>}
    </g>
  );
});

/* ── the selected piece, as numbers ── */

function PieceInspector({ piece, line, item, amount, issues, rooms, readOnly, onChange, onTurn, onTakeOff, onDelete }: {
  piece: BoardPiece; line: BoqItem; item?: Item; amount: number; issues: string[]; rooms: string[]; readOnly: boolean;
  onChange: (l: BoqItem) => void; onTurn: (by: number) => void; onTakeOff: () => void; onDelete: () => void;
}) {
  const [x, setX] = useState(String(line.place!.x));
  const [y, setY] = useState(String(line.place!.y));
  const [w, setW] = useState(String(piece.size.w));
  const [h, setH] = useState(String(piece.size.h));
  const [d, setD] = useState(String(piece.size.d));
  useEffect(() => { setX(String(line.place!.x)); setY(String(line.place!.y)); }, [line.place!.x, line.place!.y]);
  useEffect(() => { setW(String(piece.size.w)); setH(String(piece.size.h)); setD(String(piece.size.d)); }, [piece.size.w, piece.size.h, piece.size.d]);
  const num = (s: string) => Number(s);
  const commitPlace = () => {
    const nx = num(x), ny = num(y);
    if (Number.isFinite(nx) && Number.isFinite(ny) && (nx !== line.place!.x || ny !== line.place!.y)) {
      onChange({ ...line, place: { ...line.place!, x: round2(nx), y: round2(ny) } });
    }
  };
  const commitSize = () => {
    const nw = num(w), nh = num(h), nd = num(d);
    if ([nw, nh, nd].every(v => Number.isFinite(v) && v > 0) && (nw !== piece.size.w || nh !== piece.size.h || nd !== piece.size.d)) {
      onChange(resizedTo(line, item, nw, nh, nd));
    }
  };
  const field = (id: string, label: string, v: string, set: (s: string) => void, done: () => void) => (
    <div>
      <label htmlFor={id} className={`${LABEL} block mb-1`}>{label}</label>
      <input id={id} type="number" step={0.25} className={INPUT} value={v} disabled={readOnly}
        onChange={e => set(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') done(); }} />
    </div>
  );
  return (
    <div className="rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/[0.04] p-3 hud-row-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{item?.name || 'Piece'}</p>
          <p className="text-[11px] text-slate-500">{line.qty} {item?.unit} · {formatCurrency(Math.round(amount))}</p>
        </div>
        {!readOnly && (
          <span className="flex gap-0.5 shrink-0">
            <Button size="sm" variant="quiet" icon={RotateCcw} onClick={() => onTurn(-90)} aria-label="Turn left" title="Turn left (Shift+R)" />
            <Button size="sm" variant="quiet" icon={RotateCw} onClick={() => onTurn(90)} aria-label="Turn right" title="Turn right (R)" />
          </span>
        )}
      </div>
      {issues.length > 0 && (
        <p className="mt-2 text-[11px] text-rose-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" aria-hidden />{issues.map(i => ISSUE_LABEL[i as keyof typeof ISSUE_LABEL]).join(' · ')}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {field('pc-x', 'From left (ft)', x, setX, commitPlace)}
        {field('pc-y', 'From top (ft)', y, setY, commitPlace)}
        {field('pc-w', 'Width (ft)', w, setW, commitSize)}
        {field('pc-h', 'Height (ft)', h, setH, commitSize)}
        {field('pc-d', 'Depth (ft)', d, setD, commitSize)}
        <div>
          <label htmlFor="pc-room" className={`${LABEL} block mb-1`}>Room</label>
          <select id="pc-room" className={INPUT} value={line.roomId || ''} disabled={readOnly} onChange={e => onChange({ ...line, roomId: e.target.value })}>
            {!rooms.includes(line.roomId || '') && <option value={line.roomId || ''}>{line.roomId || 'None'}</option>}
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Turned {line.place!.rot}° · {ftin(piece.size.w)} × {ftin(piece.size.h)}, {ftin(piece.size.d)} deep</p>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onTakeOff}>Take off the plan</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete}>Delete line</Button>
        </div>
      )}
    </div>
  );
}

