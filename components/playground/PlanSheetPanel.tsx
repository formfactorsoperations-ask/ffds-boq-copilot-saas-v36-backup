import React, { useMemo, useRef, useState } from 'react';
import { MapIcon, Ruler, SquareDashed, ScanSearch, Upload, LayoutGrid, Check, X, MousePointer2, FileText } from 'lucide-react';
import { Panel, Button, Chip, Segmented, EmptyState, LABEL, INPUT } from '../ui/kit';
import '../projectHeader/projectHeader.css';
import type { ProjectContext, ProposalTier, Item, Room, RoomPlanRect, PlanSheet } from '../../types';
import {
  sheetOf, isPdfSheet, withScale, rescaleRooms, traceRect, rectToPx, scaleFromBoxes, rectsFromBoxes,
  placeRooms, withRect, blocksLayout, replacePlan, replanPreview, withHistory, parseFeet, type ReplanRow,
} from '../../lib/playground/planSheet';
import { ftin, roundTo3in, boundsOf, type Point } from '../../lib/playground/geometry';
import { pricingRulesOf } from '../../lib/playground/pricing';
import { buildBankMap } from '../../lib/boqPricing';
import { lockedTierId } from '../../lib/scopeFlow';
import { formatCurrency } from '../../lib/utils';
import { readPlanBoxes } from '../../services/geminiService';
import { planImageFromFile, planImageFromUrl, storePlanImage, planBase64FromUrl } from '../../services/planImage';

/*
  The plan under the BOQ (BOQ Playground PR 2).

  Shows the plan the BOQ is drawn on — the brief's plan, one uploaded here, or
  blocks laid out from the room sizes — with each room's rectangle over it. The
  studio sets the scale by measuring one wall it knows, reads the rooms off the
  drawing or traces them, and can replace the plan later: rooms are matched by
  name, pieces move with their room, and each room's price change is shown
  before anything moves. The old plan is kept in history.

  Shown in the BOQ Editor's Plan Takeoff view while the studio's BOQ
  Playground switch is on. The Playground screen (PR 3a) reuses it as its Plan lens.
*/

type Tool = 'look' | 'scale' | 'trace';
const BRAND = '#3D52A0';
const SOURCE_LABEL: Record<PlanSheet['source'], string> = {
  brief: 'The brief’s plan', upload: 'Uploaded plan', blocks: 'Blocks', sketch: 'Sketched plan',
};

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  tiers: ProposalTier[];
  setTiers?: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  activeTierId?: string;
  bank: Item[];
  tenantId?: string;
  userName?: string;
}

interface Pending { rect: RoomPlanRect; room: string; newName: string }
interface Replan {
  sheet: PlanSheet;
  rects: { name: string; plan: RoomPlanRect }[];
  rows: ReplanRow[];
  total: number;
  needsPlace: number;
  added: string[];
  missing: string[];
}

const NEW_ROOM = '__new__';

export default function PlanSheetPanel({ projectContext: ctx, setProjectContext, tiers, setTiers, activeTierId, bank, tenantId, userName }: Props) {
  const rooms: Room[] = useMemo(
    () => (ctx.rooms || []).filter(r => r?.name && !/^(functional|others|general|whole flat)$/i.test(r.name.trim())),
    [ctx.rooms],
  );
  /* Rooms already placed with no drawing under them read as blocks, rather than as no plan at all. */
  const sheet = sheetOf(ctx) || (rooms.some(r => r.plan) ? { source: 'blocks' as const } : null);
  const confirmed = !!ctx.planSheet;
  const briefPdf = !confirmed && isPdfSheet(sheet);
  const onPlan = rooms.filter(r => r.plan);
  const activeTier = tiers.find(t => t.id === activeTierId) || tiers[0];
  const bankMap = useMemo(() => buildBankMap(bank, ctx.adHocItems), [bank, ctx.adHocItems]);

  const [tool, setTool] = useState<Tool>('look');
  const [imgPx, setImgPx] = useState<{ w: number; h: number } | null>(null);
  const [pts, setPts] = useState<Point[]>([]);
  const [wallText, setWallText] = useState('');
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [replan, setReplan] = useState<Replan | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const px = sheet?.imagePx || imgPx;
  const scaled = !!sheet && Number(sheet.ftPerPx) > 0 && !!px;
  const hasImage = !!sheet?.imageUrl && !briefPdf;

  /* ── writing ── */

  const commit = (next: PlanSheet, nextRooms?: Room[]) => {
    setProjectContext(p => ({
      ...p,
      planSheet: next,
      ...(nextRooms ? { rooms: mergeRooms(p.rooms || [], nextRooms) } : {}),
    }));
  };
  const say = (tone: 'good' | 'bad', text: string) => setNote({ tone, text });
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setNote(null);
    try { await fn(); } catch (e: any) { say('bad', e?.message || String(e)); } finally { setBusy(null); }
  };
  const withPx = (s: PlanSheet): PlanSheet => (px && !s.imagePx ? { ...s, imagePx: px } : s);

  /* ── the plan's source ── */

  const useBriefPdf = () => run('Drawing page 1 of the brief’s plan…', async () => {
    const b64 = await planImageFromUrl(sheet!.imageUrl!, 1);
    const stored = await storePlanImage(tenantId, b64);
    commit({ source: 'brief', imageUrl: stored.imageUrl, imagePx: stored.imagePx, page: 1 });
    say('good', 'Page 1 of the brief’s plan is under the BOQ. Set the scale next: measure one wall you know.');
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    run('Reading the new plan…', async () => {
      const b64 = await planImageFromFile(file, 1);
      const stored = await storePlanImage(tenantId, b64);
      const next: PlanSheet = { source: 'upload', imageUrl: stored.imageUrl, imagePx: stored.imagePx, ...(file.type === 'application/pdf' ? { page: 1 } : {}) };
      if (onPlan.length === 0) {
        commit(next);
        say('good', 'The plan is under the BOQ. Set the scale next: measure one wall you know.');
        return;
      }
      await prepareReplan(next, stored.base64);
    });
  };

  const useBlocks = () => {
    const laid = blocksLayout(rooms);
    commit({ source: 'blocks' }, laid);
    say('good', 'Rooms laid out as blocks from their sizes. Upload the plan when you have it.');
  };

  /* ── rooms off the drawing ── */

  const readBoxes = async (s: PlanSheet, base64?: string) => {
    if (!s.imageUrl || !s.imagePx) throw new Error('The plan has not loaded yet.');
    const b64 = base64 || await planBase64FromUrl(s.imageUrl);
    const { boxes } = await readPlanBoxes(b64, ctx.area);
    if (!boxes.length) throw new Error('No rooms could be read off this plan. Trace them instead.');
    const k = Number(s.ftPerPx) > 0 ? s.ftPerPx! : scaleFromBoxes(boxes, s.imagePx);
    if (!k) throw new Error('No room on the plan has its size printed, so the scale is not known. Set the scale, then read the rooms again.');
    return { k, rects: rectsFromBoxes(boxes, s.imagePx, k) };
  };

  const readRooms = () => run('Reading the rooms off the plan…', async () => {
    const s = withPx(sheet!);
    const { k, rects } = await readBoxes(s);
    const next = { ...s, ftPerPx: k, readAt: Date.now() };
    if (onPlan.length) { await prepareReplan(next, undefined, rects); return; }
    const placed = placeRooms(rooms, rects);
    commit(next, placed.rooms);
    say('good', `${rects.length} room${rects.length === 1 ? '' : 's'} placed.${placed.added.length ? ` New on the plan: ${placed.added.join(', ')}.` : ''}${placed.missing.length ? ` Not found on it: ${placed.missing.join(', ')}.` : ''}`);
  });

  /* ── replacing the plan ── */

  const prepareReplan = async (next: PlanSheet, base64?: string, known?: { name: string; plan: RoomPlanRect }[]) => {
    const { k, rects } = known ? { k: next.ftPerPx!, rects: known } : await readBoxes(next, base64);
    const sheetNext = { ...next, ftPerPx: k, readAt: Date.now() };
    const result = replacePlan({ rooms, boq: activeTier?.boq || [], bankMap, oldSheet: ctx.planSheet, rects, at: Date.now(), by: userName });
    const preview = replanPreview({
      before: { rooms, boq: activeTier?.boq || [] },
      after: { rooms: result.rooms, boq: result.boq },
      bankMap, rules: pricingRulesOf(activeTier),
    });
    setReplan({ sheet: sheetNext, rects, rows: preview.rows, total: preview.total, needsPlace: result.needsPlace.length, added: result.added, missing: result.missing });
  };

  const applyReplan = () => {
    if (!replan) return;
    const locked = lockedTierId(ctx);
    const at = Date.now();
    let roomsAfter: Room[] = rooms;
    let history = ctx.planHistory;
    if (setTiers) {
      setTiers(ts => ts.map(t => {
        if (t.id === locked) return t;
        const r = replacePlan({ rooms, boq: t.boq || [], bankMap, oldSheet: ctx.planSheet, rects: replan.rects, at, by: userName });
        return { ...t, boq: r.boq };
      }));
    }
    const r = replacePlan({ rooms, boq: [], bankMap, oldSheet: ctx.planSheet, rects: replan.rects, at, by: userName });
    roomsAfter = r.rooms;
    history = withHistory(ctx.planHistory, r.history);
    setProjectContext(p => ({ ...p, planSheet: replan.sheet, planHistory: history, rooms: mergeRooms(p.rooms || [], roomsAfter) }));
    say('good', `The new plan is under the BOQ.${replan.needsPlace ? ` ${replan.needsPlace} piece${replan.needsPlace === 1 ? '' : 's'} no longer fit and wait under Needs a place.` : ''} The old plan is kept in history.`);
    setReplan(null);
  };

  /* ── pointer on the drawing ── */

  const toPx = (e: React.PointerEvent): Point | null => {
    const el = svgRef.current;
    if (!el || !px) return null;
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * px.w, ((e.clientY - r.top) / r.height) * px.h];
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toPx(e);
    if (!p) return;
    if (tool === 'scale') { setPts(prev => (prev.length >= 2 ? [p] : [...prev, p])); return; }
    if (tool === 'trace' && scaled) { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ a: p, b: p }); }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPx(e);
    if (p) setDrag({ ...drag, b: p });
  };
  const onUp = () => {
    if (!drag || !sheet) return;
    const rect = traceRect(withPx(sheet), drag.a, drag.b);
    setDrag(null);
    if (!rect) return;
    const free = rooms.find(r => !r.plan);
    setPending({ rect, room: free?.name || NEW_ROOM, newName: '' });
  };

  const setScale = () => {
    const feet = parseFeet(wallText);
    if (pts.length < 2 || !feet || !sheet) { say('bad', 'Click both ends of a wall you know, then type its length, like 12′6″ or 3.8 m.'); return; }
    const before = withPx(sheet);
    const next = withScale(before, pts[0], pts[1], feet);
    if (!next) { say('bad', 'Those two points are too close together. Click the two ends of a whole wall.'); return; }
    commit(next, Number(before.ftPerPx) > 0 ? rescaleRooms(rooms, before, next) : undefined);
    setPts([]); setWallText(''); setTool('look');
    say('good', `Scale set: that wall is ${ftin(feet)}. Read the rooms off the plan, or trace them.`);
  };

  /* ── placing one room by hand (traced, or typed) ── */

  const placeOne = () => {
    if (!pending) return;
    const { rect } = pending;
    const name = pending.room === NEW_ROOM ? pending.newName.trim() : pending.room;
    if (!name) { say('bad', 'Name the new room.'); return; }
    if (!(rect.w >= 1 && rect.h >= 1)) { say('bad', 'A room is at least 1′ each way.'); return; }
    const existing = rooms.find(r => r.name === name);
    const next = existing
      ? rooms.map(r => (r.name === name ? withRect(r, rect) : r))
      : [...rooms, withRect({ name, size: 0, unit: 'sq ft' }, rect)];
    commit(withPx(sheet || { source: 'blocks' }), next);
    setPending(null);
    say('good', `${name} is on the plan: ${ftin(rect.w)} × ${ftin(rect.h)}.`);
  };
  const typePlace = (room: Room) => setPending({
    room: room.name, newName: '',
    rect: room.plan || { x: 0, y: 0, w: roundTo3in(Number(room.length) || Math.sqrt(Number(room.size) || 100)), h: roundTo3in(Number(room.width) || Math.sqrt(Number(room.size) || 100)) },
  });
  const takeOff = (room: Room) => commit(withPx(sheet || { source: 'blocks' }), rooms.map(r => (r.name === room.name ? { ...r, plan: undefined } : r)));

  /* ── drawing ── */

  const roomShapes = (toBox: (r: RoomPlanRect) => { x: number; y: number; w: number; h: number } | null, unit: number) =>
    onPlan.map(r => {
      const b = toBox(r.plan!);
      if (!b) return null;
      return (
        <g key={r.name}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={BRAND} fillOpacity={0.08} stroke={BRAND} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {/* In the room's top-left corner, clear of the labels the drawing prints in the middle. */}
          <text x={b.x + unit * 0.8} y={b.y + unit * 2} fontSize={unit * 1.4} fontWeight={700} fill={BRAND}>{r.name}</text>
          <text x={b.x + unit * 0.8} y={b.y + unit * 3.7} fontSize={unit * 1.15} fill="#475569">{ftin(r.plan!.w)} × {ftin(r.plan!.h)}</text>
        </g>
      );
    });

  const stage = () => {
    if (!sheet) return null;
    if (briefPdf) {
      return (
        <EmptyState icon={FileText} title="The brief’s plan is a PDF"
          text="Page 1 is drawn as an image and kept with the project; the PDF stays as it is."
          action={<Button size="sm" variant="primary" onClick={useBriefPdf} disabled={!!busy}>Use page 1</Button>} />
      );
    }
    if (hasImage) {
      const unit = (px?.w || 1000) / 90;
      const live = drag && sheet ? traceRect(withPx(sheet), drag.a, drag.b) : null;
      const liveBox = live && px ? rectToPx(withPx(sheet), live) : null;
      return (
        <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 select-none">
          <img
            src={sheet.imageUrl} alt="The plan under this BOQ" className="block w-full h-auto" draggable={false}
            onLoad={e => { const i = e.currentTarget; setImgPx({ w: i.naturalWidth, h: i.naturalHeight }); }}
          />
          {px && (
            <svg
              ref={svgRef} viewBox={`0 0 ${px.w} ${px.h}`} preserveAspectRatio="none"
              className={`absolute inset-0 w-full h-full ${tool === 'look' ? '' : 'cursor-crosshair'}`}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
              role="img" aria-label="Rooms on the plan"
            >
              {scaled && roomShapes(r => rectToPx(withPx(sheet), r), unit)}
              {liveBox && <rect x={liveBox.x} y={liveBox.y} width={liveBox.w} height={liveBox.h} fill={BRAND} fillOpacity={0.15} stroke={BRAND} strokeDasharray="6 4" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={unit * 0.6} fill={BRAND} />)}
              {pts.length === 2 && <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke={BRAND} strokeWidth={3} vectorEffect="non-scaling-stroke" />}
            </svg>
          )}
        </div>
      );
    }
    // Blocks: the rooms on their own, in feet.
    const b = boundsOf(onPlan.map(r => r.plan!));
    if (!b) return null;
    const pad = 1;
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
        <svg viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="block w-full h-auto max-h-[520px]" role="img" aria-label="Rooms laid out as blocks">
          {roomShapes(r => r, Math.max(b.w, b.h) / 45)}
        </svg>
      </div>
    );
  };

  /* ── the panel ── */

  const scaleChip = !sheet || sheet.source === 'blocks' ? null
    : scaled ? <Chip tone="good">Scale set</Chip> : <Chip tone="warn">Scale not set</Chip>;

  return (
    <>
      <Panel
        icon={MapIcon}
        title="The plan"
        badge={<>{sheet && <Chip tone="brand">{SOURCE_LABEL[sheet.source]}{confirmed ? '' : ' · not checked yet'}</Chip>}{scaleChip}</>}
        blurb="The drawing the BOQ sits on. Rooms are rectangles on it, in feet; an L-shaped room is two rooms."
        aside={
          <>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Button size="sm" icon={Upload} onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {onPlan.length ? 'Replace the plan' : 'Upload a plan'}
            </Button>
          </>
        }
        foot={ctx.planHistory?.length ? `${ctx.planHistory.length} earlier plan${ctx.planHistory.length === 1 ? '' : 's'} kept in history.` : undefined}
      >
        {!sheet ? (
          <EmptyState icon={MapIcon} title="No plan on this project yet"
            text="Upload the plan (an image or a PDF), or lay the rooms out as blocks from their sizes."
            action={rooms.length ? <Button size="sm" icon={LayoutGrid} onClick={useBlocks}>Lay out as blocks</Button> : undefined} />
        ) : (
          <div className="space-y-4">
            {hasImage && (
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<Tool> label="What a click on the plan does" size="sm" value={tool}
                  onChange={v => { setTool(v); setPts([]); setDrag(null); }}
                  options={[
                    { id: 'look', label: <><MousePointer2 className="w-3.5 h-3.5" aria-hidden />Look</> },
                    { id: 'scale', label: <><Ruler className="w-3.5 h-3.5" aria-hidden />Set the scale</> },
                    { id: 'trace', label: <><SquareDashed className="w-3.5 h-3.5" aria-hidden />Trace a room</> },
                  ]} />
                <Button size="sm" variant="quiet" icon={ScanSearch} onClick={readRooms} disabled={!!busy || !px}>Read rooms off the plan</Button>
              </div>
            )}

            {tool === 'scale' && hasImage && (
              <div className="rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-end gap-3 hud-row-in">
                <p className="text-xs text-slate-500 basis-full">
                  {pts.length < 2 ? `Click the ${pts.length ? 'other' : 'first'} end of a wall whose length you know.` : 'Now type that wall’s length.'}
                </p>
                <div className="w-48">
                  <label htmlFor="plan-wall" className={`${LABEL} block mb-1.5`}>That wall is</label>
                  <input id="plan-wall" className={INPUT} placeholder="12′6″ or 3.8 m" value={wallText} onChange={e => setWallText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') setScale(); }} />
                </div>
                <Button size="sm" variant="primary" icon={Check} onClick={setScale} disabled={pts.length < 2}>Set the scale</Button>
              </div>
            )}
            {tool === 'trace' && hasImage && !scaled && (
              <p className="text-xs text-amber-700">Set the scale first, so a traced room comes out in feet.</p>
            )}

            {stage()}

            {pending && (
              <div className="rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/[0.04] px-4 py-3 hud-row-in">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div className="col-span-2">
                    <label htmlFor="plan-room" className={`${LABEL} block mb-1.5`}>Room</label>
                    <select id="plan-room" className={INPUT} value={pending.room} onChange={e => setPending({ ...pending, room: e.target.value })}>
                      {rooms.map(r => <option key={r.name} value={r.name}>{r.name}{r.plan ? ' · on the plan' : ''}</option>)}
                      <option value={NEW_ROOM}>A new room…</option>
                    </select>
                  </div>
                  {(['x', 'y', 'w', 'h'] as const).map(k => (
                    <div key={k}>
                      <label htmlFor={`plan-${k}`} className={`${LABEL} block mb-1.5`}>{{ x: 'From left', y: 'From top', w: 'Width', h: 'Depth' }[k]} (ft)</label>
                      <input id={`plan-${k}`} type="number" step={0.25} className={INPUT} value={pending.rect[k]}
                        onChange={e => setPending({ ...pending, rect: { ...pending.rect, [k]: roundTo3in(Number(e.target.value) || 0) } })} />
                    </div>
                  ))}
                  {pending.room === NEW_ROOM && (
                    <div className="col-span-2">
                      <label htmlFor="plan-new" className={`${LABEL} block mb-1.5`}>New room’s name</label>
                      <input id="plan-new" className={INPUT} value={pending.newName} onChange={e => setPending({ ...pending, newName: e.target.value })} placeholder="e.g. Study" />
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => setPending(null)}>Cancel</Button>
                  <Button size="sm" variant="primary" icon={Check} onClick={placeOne}>Put it on the plan</Button>
                </div>
              </div>
            )}

            {(busy || note) && (
              <p role="status" className={`text-xs ${busy ? 'text-slate-500' : note?.tone === 'bad' ? 'text-rose-700' : 'text-emerald-700'}`}>{busy || note?.text}</p>
            )}

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className={LABEL}>Rooms</span>
                <span className="text-[11px] text-slate-500">{onPlan.length} of {rooms.length} on the plan</span>
              </div>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {rooms.map((r, i) => (
                  <div key={r.name} className="px-4 py-2.5 flex items-center gap-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                    <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{r.name}</span>
                    {r.plan
                      ? <span className="text-xs text-slate-500 tabular-nums">{ftin(r.plan.w)} × {ftin(r.plan.h)} · {Math.round(r.plan.w * r.plan.h)} sq ft</span>
                      : <Chip tone="slate">Not on the plan</Chip>}
                    <Button size="sm" variant="quiet" onClick={() => typePlace(r)}>{r.plan ? 'Edit' : 'Place by size'}</Button>
                    {r.plan && <Button size="sm" variant="quiet" icon={X} onClick={() => takeOff(r)} aria-label={`Take ${r.name} off the plan`} title="Take it off the plan" />}
                  </div>
                ))}
                {rooms.length === 0 && <p className="px-4 py-3 text-xs text-slate-500">No rooms on this project yet. Trace one, or add rooms in Brief & Site.</p>}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {replan && (
        <ReplanModal replan={replan} onCancel={() => setReplan(null)} onApply={applyReplan} />
      )}
    </>
  );
}

/** Replaces each named room with its updated copy and appends the new ones. */
function mergeRooms(all: Room[], next: Room[]): Room[] {
  const byName = new Map(next.map(r => [r.name, r]));
  const out = all.map(r => byName.get(r.name) || r);
  next.forEach(r => { if (!all.some(a => a.name === r.name)) out.push(r); });
  return out;
}

function ReplanModal({ replan, onCancel, onApply }: { replan: Replan; onCancel: () => void; onApply: () => void }) {
  const money = (n: number) => (Math.abs(n) < 1 ? '—' : `${n > 0 ? '+' : '−'}${formatCurrency(Math.abs(Math.round(n)))}`);
  const size = (r?: RoomPlanRect) => (r ? `${ftin(r.w)} × ${ftin(r.h)}` : '—');
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Replace the plan">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">The plan under this BOQ</p>
          <h2 className="font-bold text-slate-800">Replace with the new plan</h2>
          <p className="text-xs text-slate-500 mt-0.5">Rooms matched by name. Check the sizes and what each room’s price does before you use it.</p>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-4">
          <table className="w-full text-xs">
            <thead>
              <tr className={`text-left ${LABEL}`}>
                <th className="py-1.5 font-bold">Room</th><th className="py-1.5 font-bold">Was</th><th className="py-1.5 font-bold">On the new plan</th><th className="py-1.5 font-bold text-right">Price change</th>
              </tr>
            </thead>
            <tbody>
              {replan.rows.map(r => (
                <tr key={r.room} className="border-t border-slate-100">
                  <td className="py-2 font-semibold text-slate-700">{r.room}</td>
                  <td className="py-2 tabular-nums text-slate-500">{size(r.was)}</td>
                  <td className="py-2 tabular-nums text-slate-800">{size(r.now)}</td>
                  <td className={`py-2 text-right tabular-nums font-bold ${r.change > 0.5 ? 'text-rose-700' : r.change < -0.5 ? 'text-emerald-700' : 'text-slate-400'}`}>{money(r.change)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200">
                <td colSpan={3} className="py-2 font-bold text-slate-800">The work</td>
                <td className="py-2 text-right tabular-nums font-black text-slate-800">{money(replan.total)}</td>
              </tr>
            </tbody>
          </table>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">What happens</p>
            <p>Pieces move with their room and keep their sizes.{replan.needsPlace ? ` ${replan.needsPlace} no longer fit and wait under Needs a place.` : ''}</p>
            <p>Measured lines follow the new sizes: painting, ceilings and electrical shared into rooms. Typed quantities stay as typed.</p>
            {replan.added.length > 0 && <p>New on the plan, added empty: {replan.added.join(', ')}.</p>}
            {replan.missing.length > 0 && <p>Not found on the new plan, kept off it: {replan.missing.join(', ')}.</p>}
            <p>The current plan is kept in history.</p>
          </div>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <Button onClick={onCancel}>Keep the current plan</Button>
          <Button variant="primary" onClick={onApply}>Use the new plan</Button>
        </div>
      </div>
    </div>
  );
}
