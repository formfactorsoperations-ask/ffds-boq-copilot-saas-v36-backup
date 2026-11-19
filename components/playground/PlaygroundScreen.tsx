import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PenTool, Map as MapIcon, LayoutGrid, Table2, SlidersHorizontal, Target, Plus, Search, Check, Undo2, Upload, Download,
  ChevronDown, FileText, Expand, Shrink, Receipt as ReceiptIcon, Lock, Sparkles, MapPin, X,
} from 'lucide-react';
import { Button, EmptyState, LABEL, Segmented } from '../ui/kit';
import { useSeesMargins } from '../ui/HideFigures';
import type { ProjectContext, ProposalTier, Item, BoqItem, Room } from '../../types';
import { realRooms } from '../../lib/scopeBuckets';
import { boardPieces, drawOf, isHigh, isWallBacked, pieceSize, footprintOf, wallCovers } from '../../lib/playground/pieces';
import { autoPlace, type PlacedPiece } from '../../lib/playground/placing';
import { lineIssues, marginFloorFor } from '../../lib/playground/issues';
import { pricingRulesOf, playgroundTotals } from '../../lib/playground/pricing';
import { boqFormatOf, BOQ_FORMAT_LABEL, paintingFromPlan } from '../../lib/playground/versions';
import { sheetOf } from '../../lib/playground/planSheet';
import { newPieceLine, needsPlace, pushHistory, undoHistory, type History } from '../../lib/playground/board';
import { ArtDefs } from './pieceArt';
import { inr, Ring, lineModel, type LineModel } from './playgroundUi';
import PlanStage from './PlanStage';
import Catalogue from './Catalogue';
import RoomsLens from './RoomsLens';
import SheetLens from './SheetLens';
import TuneLens from './TuneLens';
import type { MarginFloors } from '../../lib/playground/issues';
import { Receipt, LineInspector, RoomInspector, useShareRows } from './LiveBoq';
import PlanSheetPanel from './PlanSheetPanel';
import RecipeDrawer from '../materialSpecs/RecipeDrawer';
import { artOfSpecs } from './pieceArt';
import type { MaterialSpecsBank } from '../../lib/materialSpecs';
import { gradeOf, offersUpdates, withRecipeSpecs, updatedLine, recipeOf, specsFromRecipe } from '../../lib/lineSpecs';

/*
  The BOQ Playground (the approved mockup, v14): the BOQ Editor's one tab.

  One bar across the top (the version, the five lenses, the library, search,
  save, undo, import, export), and under it the lens beside the inspector:

    Plan    the flat drawn to scale, furniture on it, a price on every room
    Rooms   a card per room (was Cards)
    Sheet   every line in a grid (was Excel)
    Tune    markups by room and the client's number (comes with PR 4)
    Deal    offers, fee, GST and what the client pays (comes with PR P)

  The inspector is the Live BOQ until a line or a room is picked. Every change,
  wherever it is made, writes the same BOQ, so the lenses always agree, and one
  gesture is one undo.
*/

export type Lens = 'plan' | 'rooms' | 'sheet' | 'tune' | 'deal';
const LENSES: [Lens, string, React.ElementType, string][] = [
  ['plan', 'Plan', MapIcon, 'Was Plan Takeoff: rooms, sizes and quantities from the plan'],
  ['rooms', 'Rooms', LayoutGrid, 'Was Cards: a card per room'],
  ['sheet', 'Sheet', Table2, 'Was Excel: every line in a grid'],
  ['tune', 'Tune', SlidersHorizontal, 'Markups and the client’s number'],
  ['deal', 'Deal', Target, 'Offers, design fee, GST and what the client pays'],
];
const HINT_KEY = 'ffds.playground.hintDone';

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  tiers: ProposalTier[];
  setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  tier: ProposalTier;
  bank: Item[];
  bankMap: Map<string, Item>;
  /** The BOQ is frozen: everything is shown, nothing changes. */
  readOnly: boolean;
  currentRoles?: any;
  tenantId?: string;
  /** Writes the option's BOQ whole. */
  onBoq: (next: BoqItem[]) => void;
  newId: () => string;
  onSelectTier?: (id: string) => void;
  onMakePlaygroundVersion?: () => void;
  onSave: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onImport: () => void;
  onExportExcel?: () => void;
  onExportPdf: () => void;
  /** Opens the Item Bank picker for a room (the existing Add items dialog). */
  onAddFromBank: (room: string) => void;
  /** Opened at a line (from Pricing & Tiers): it opens on the Sheet with the line picked. */
  focusLineId?: string | null;
  /** The full grid (the Excel view as it was: statuses, linkage, notes), opened from the Sheet. */
  renderFullGrid?: () => React.ReactNode;
  /** The Material specs bank (S2): new lines take their recipe's materials, and drafts are offered newer versions. */
  specBank?: MaterialSpecsBank | null;
  /** The Owner (and Super Admin) may change a recipe from a line's Item recipe drawer. */
  canEditRecipes?: boolean;
  onSaveSpecs?: (bank: MaterialSpecsBank) => Promise<void>;
  /** Studio settings `marginFloors`: Tune never goes under them, and lines under them are flagged. */
  marginFloors?: MarginFloors | null;
}

export default function PlaygroundScreen(props: Props) {
  const { projectContext: ctx, setProjectContext, tiers, setTiers, tier, bank, bankMap, readOnly, currentRoles, tenantId, onBoq, newId,
    onSelectTier, onMakePlaygroundVersion, onSave, saveState, onImport, onExportExcel, onExportPdf, onAddFromBank, focusLineId, renderFullGrid, specBank, canEditRecipes, onSaveSpecs, marginFloors } = props;
  const boq = tier.boq || [];
  const seesMargins = useSeesMargins(currentRoles);
  /* Hide figures hides margins only (lib/figuresPrivacy): prices stay, and seesMargins already reads it. */
  const hideFigures = false;
  const rules = pricingRulesOf(tier);
  const format = boqFormatOf(tier);

  const [lens, setLens] = useState<Lens>(focusLineId ? 'sheet' : 'plan');
  const [sel, setSel] = useState<string | null>(focusLineId || null);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(true);
  const [insOpen, setInsOpen] = useState(true);
  const [q, setQ] = useState('');
  const [hist, setHist] = useState<History<BoqItem[]>>({ past: [], future: [] });
  const [note, setNote] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [menu, setMenu] = useState<'ver' | 'export' | 'plan' | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [fullGrid, setFullGrid] = useState(false);
  const [recipeItemId, setRecipeItemId] = useState<string | null>(null);
  /* S2: the option's grade picks each recipe's column; a draft is offered newer versions. */
  const grade = gradeOf(tier);
  const offer = !!specBank && offersUpdates(tier, ctx, readOnly);
  const spec = useMemo(() => (specBank ? { bank: specBank, offer } : undefined), [specBank, offer]);
  /* A Classic BOQ stays as it was: its new lines keep the Item Bank's words. */
  const prepareNew = useCallback((line: BoqItem) => (format === 'playground' ? withRecipeSpecs(line, bankMap.get(line.bankId), specBank, grade) : line), [bankMap, specBank, grade, format]);
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY); } catch { return true; } });
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1280));
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1280);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => { if (focusLineId) { setLens('sheet'); setSel(focusLineId); } }, [focusLineId]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 3200); return () => clearTimeout(t); }, [note]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element)?.closest?.('[data-pg-menu]')) setMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  /* ── one reading of the BOQ ── */

  const rooms: Room[] = useMemo(() => realRooms(ctx.rooms || []), [ctx.rooms]);
  const planRooms = useMemo(() => rooms.filter(r => r.plan).map(r => ({ name: r.name, plan: r.plan })), [rooms]);
  const pieces = useMemo(() => boardPieces(boq, bankMap), [boq, bankMap]);
  const measure = useMemo(() => ({ covers: wallCovers(pieces) }), [pieces]);
  const models: LineModel[] = useMemo(
    () => boq.filter(l => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted').map(l => lineModel(l, bankMap, rules, rooms, measure, spec)),
    [boq, bankMap, rules, rooms, measure, spec],
  );
  const byId = useMemo(() => new Map(models.map(m => [m.line.id, m])), [models]);
  const totals = useMemo(() => playgroundTotals(boq, bankMap, { rules, rooms, measure }), [boq, bankMap, rules, rooms, measure]);
  const margin = totals.sell > 0 ? ((totals.sell - totals.cost) / totals.sell) * 100 : 0;
  const shares = useShareRows(models, rooms, bankMap, rules, measure);
  const floors: MarginFloors | null = marginFloors || (ctx as any)?.marginFloors || null;
  const floor = marginFloorFor(undefined, floors);
  const waiting = useMemo(() => needsPlace(boq, bankMap), [boq, bankMap]);
  const query = useCallback((m: LineModel) => {
    const s = q.trim().toLowerCase();
    return !s || `${m.name} ${m.words} ${m.cat}`.toLowerCase().includes(s);
  }, [q]);

  /* ── writing, with undo ── */

  const commit = useCallback((next: BoqItem[], msg?: string) => {
    if (readOnly) return;
    setHist(h => pushHistory(h, boq));
    onBoq(next);
    if (msg) setNote(msg);
  }, [boq, onBoq, readOnly]);
  const replace = (line: BoqItem, msg?: string) => commit(boq.map(l => (l.id === line.id ? line : l)), msg);
  const replaceMany = (lines: BoqItem[]) => { const m = new Map(lines.map(l => [l.id, l])); commit(boq.map(l => m.get(l.id) || l)); };
  const remove = (ids: string[]) => { const s = new Set(ids); commit(boq.filter(l => !s.has(l.id)), `${ids.length === 1 ? 'Line' : `${ids.length} lines`} deleted. Undo puts ${ids.length === 1 ? 'it' : 'them'} back.`); if (sel && s.has(sel)) setSel(null); };
  const undo = () => { const r = undoHistory(hist, boq); if (r) { setHist(r.h); onBoq(r.state); setNote('Undone.'); } };

  const probeOf = (item: Item, line?: BoqItem): PlacedPiece | null => {
    const draw = drawOf(item);
    if (!draw) return null;
    const size = line ? pieceSize(line, item, draw) : { w: draw.w, h: draw.h, d: draw.d };
    return { id: line?.id || '__new', fp: footprintOf(size), place: { x: 0, y: 0, rot: 0 }, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };
  /** A bank item added to a room: on the plan along a free wall when it draws and fits, else as a line in the room. */
  const addToRoom = (item: Item, roomName: string) => {
    const planRoom = planRooms.find(r => r.name === roomName);
    const probe = probeOf(item);
    if (planRoom && probe) {
      const at = autoPlace(probe, planRoom, pieces.filter(p => p.room === roomName));
      const made = at ? newPieceLine(item, roomName, at, newId()) : null;
      const line = made ? prepareNew(made) : null;
      if (line) { commit([...boq, line], `${item.name} added to ${roomName}.`); setSel(line.id); return; }
    }
    const line: BoqItem = prepareNew({ id: newId(), bankId: item.id, qty: 1, roomId: roomName, baseRate: item.materials });
    commit([...boq, line], probe && planRoom ? `${item.name} added to ${roomName}. No free wall fits it: drag it into place.` : `${item.name} added to ${roomName}.`);
    setSel(line.id);
  };
  const libTarget = selRoom || (sel ? byId.get(sel)?.room : null) || planRooms[0]?.name || rooms[0]?.name || 'Others';
  const placeLine = (line: BoqItem) => {
    const item = bankMap.get(line.bankId);
    const room = planRooms.find(r => r.name === line.roomId);
    const probe = item ? probeOf(item, line) : null;
    if (!room || !probe) { setNote(`${line.roomId || 'Its room'} is not on the plan yet.`); return; }
    const at = autoPlace(probe, room, pieces.filter(p => p.room === room.name));
    if (!at) { setNote(`${item?.name || 'It'} does not fit along a free wall in ${room.name}.`); return; }
    replace({ ...line, place: { x: at.x, y: at.y, rot: at.rot, depthFt: probe.fp.d } }, `${item?.name || 'Piece'} placed in ${room.name}.`);
  };
  const duplicate = (m: LineModel) => {
    const copy: BoqItem = { ...m.line, id: newId() };
    if (copy.place) {
      const room = planRooms.find(r => r.name === copy.roomId);
      const probe = m.item ? probeOf(m.item, copy) : null;
      const at = room && probe ? autoPlace(probe, room, pieces.filter(p => p.room === room.name)) : null;
      copy.place = at ? { ...copy.place, x: at.x, y: at.y, rot: at.rot } : { ...copy.place, x: copy.place.x + 0.5, y: copy.place.y + 0.5 };
    }
    commit([...boq, copy], `${m.name} duplicated.`);
    setSel(copy.id);
  };
  const canPaint = !boq.some(l => l.byRoom?.basis === 'wallPaint') && rooms.length > 0 && !!paintingFromPlan(bank, rooms, () => 'probe');
  const addPainting = () => { const p = paintingFromPlan(bank, rooms, newId); if (p) commit([...boq, ...p.lines], 'Painting added from the plan, shared into the rooms.'); };

  /* Lines taken to the current versions of their materials. */
  const updateLines = (ids: string[]) => {
    if (!specBank) return;
    const set = new Set(ids);
    let n = 0;
    const next = boq.map(l => {
      if (!set.has(l.id)) return l;
      const u = updatedLine(specBank, l, bankMap.get(l.bankId));
      if (u !== l) n++;
      return u;
    });
    if (n) commit(next, `${n} line${n === 1 ? '' : 's'} updated to the latest specs.`);
    else setNote('Those lines already use the latest specs.');
  };
  const pickLine = (id: string | null) => { setSel(id); if (id) setSelRoom(null); };
  const pickRoom = (name: string | null) => { setSelRoom(name); if (name) setSel(null); };
  const step = (d: number) => {
    const i = models.findIndex(m => m.line.id === sel);
    const n = models[(i + d + models.length) % models.length];
    if (n) setSel(n.line.id);
  };

  /* Keys: Ctrl+Z undoes; on the plan, the arrows nudge, R turns, Delete deletes. */
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') { setSel(null); setSelRoom(null); setMenu(null); return; }
    const line = sel ? boq.find(l => l.id === sel) : undefined;
    if (!line || readOnly || lens !== 'plan' || !line.place) return;
    const k = e.key, s = e.shiftKey ? 1 : 0.25;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      replace({ ...line, place: { ...line.place, x: Math.round((line.place.x + (k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0)) * 100) / 100, y: Math.round((line.place.y + (k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0)) * 100) / 100 } });
    } else if (k === 'r' || k === 'R') {
      e.preventDefault();
      replace({ ...line, place: { ...line.place, rot: (((line.place.rot + (e.shiftKey ? -90 : 90)) % 360) + 360) % 360 } });
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault(); remove([line.id]);
    }
  };

  /* ── layout ── */

  const plan = lens === 'plan';
  const showLib = libOpen && !readOnly && lens !== 'tune' && lens !== 'deal';
  const selModel = sel ? byId.get(sel) : undefined;
  const selRoomObj = selRoom ? rooms.find(r => r.name === selRoom) : undefined;
  const showIns = !wide || !!selModel || !!selRoomObj || (plan && insOpen);
  const sheet = sheetOf(ctx);
  const planLabel = `${(ctx.name || 'Project').split(/[–—-]/)[0].trim()} plan · ${sheet?.source === 'upload' ? 'uploaded' : sheet?.source === 'blocks' || (!sheet && planRooms.length) ? 'blocks' : sheet?.source === 'sketch' ? 'sketched' : 'from Brief'}`;
  const verDot = readOnly ? 'bg-slate-400' : format === 'playground' ? 'bg-[#3D52A0]' : 'bg-slate-400';

  const inspector = selModel ? (
    <React.Fragment key={selModel.line.id}><LineInspector
      m={selModel}
      index={models.findIndex(x => x.line.id === selModel.line.id)}
      count={models.length}
      issues={lineIssues(selModel.line, { bankMap, pieces, rooms: planRooms, floors, specBank: offer ? specBank : null })}
      rooms={rooms}
      bankMap={bankMap}
      rules={rules}
      readOnly={readOnly}
      seesMargins={seesMargins}
      hideFigures={hideFigures}
      floor={floor}
      specBank={specBank}
      offerUpdates={offer}
      onOpenRecipe={specBank ? setRecipeItemId : undefined}
      onReplace={l => replace(l)}
      onStep={step}
      onClose={() => setSel(null)}
      onDuplicate={() => duplicate(selModel)}
      onDelete={() => remove([selModel.line.id])}
      onTakeOff={() => { const { place: _p, ...rest } = selModel.line; replace(rest as BoqItem, 'Taken off the plan; the line stays in the BOQ.'); }}
      onPlace={() => placeLine(selModel.line)}
    /></React.Fragment>
  ) : selRoomObj ? (
    <React.Fragment key={selRoomObj.name}><RoomInspector
      room={selRoomObj}
      models={models.filter(m => m.room === selRoomObj.name && !m.line.byRoom)}
      shares={shares.get(selRoomObj.name) || []}
      total={totals.byRoom.get(selRoomObj.name) || 0}
      rooms={rooms}
      bankMap={bankMap}
      rules={rules}
      measure={measure}
      readOnly={readOnly}
      hideFigures={hideFigures}
      canPaint={canPaint}
      onAddPainting={addPainting}
      onSel={pickLine}
      onClose={() => setSelRoom(null)}
      onReplace={l => replace(l)}
    /></React.Fragment>
  ) : (
    <Receipt
      models={models}
      rooms={rooms}
      roomTotals={totals.byRoom}
      shares={shares}
      workTotal={totals.sell}
      tierName={tier.name}
      sel={sel}
      onSel={pickLine}
      onRoom={pickRoom}
      hideFigures={hideFigures}
      hint={hint}
      onHint={() => { setHint(false); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private window */ } }}
      onLens={l => { setLens(l); setFitSignal(s => s + 1); }}
      onHide={wide && plan ? () => setInsOpen(false) : undefined}
      onUpdateStale={offer ? () => updateLines(models.filter(m => m.stale.length).map(m => m.line.id)) : undefined}
    />
  );

  const barBtn = 'px-2.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap';

  return (
    <div onKeyDown={onKey} tabIndex={-1}
      className={`outline-none ${full ? 'fixed inset-0 z-[150] bg-slate-50 p-3 flex flex-col gap-3' : 'flex flex-col gap-3 mb-6'}`}
      style={full ? undefined : { height: wide ? 'calc(100vh - 150px)' : undefined, minHeight: wide ? 640 : undefined }}>
      <ArtDefs />

      {format === 'classic' && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 flex-wrap hud-panel-in">
          <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 grid place-items-center shrink-0"><Lock className="w-4 h-4" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-800">A Classic BOQ, priced as it always was</div>
            <p className="text-xs text-slate-500">Exact amounts, line by line. Make a Playground version to price it by the Playground’s rules (every amount rounded up to ₹100); this one stays as it is.</p>
          </div>
          {!readOnly && onMakePlaygroundVersion && <Button size="sm" variant="primary" icon={Sparkles} onClick={onMakePlaygroundVersion}>Make a Playground version</Button>}
        </div>
      )}

      {/* The bar */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-2 flex items-center gap-2 flex-wrap shadow-sm">
        <div className="flex items-center gap-2 pl-0.5">
          <span className="w-8 h-8 rounded-xl bg-[#3D52A0] text-white grid place-items-center shrink-0" title="BOQ Playground"><PenTool className="w-4 h-4" aria-hidden /></span>
          <div className="leading-tight hidden 2xl:block">
            <div className="text-sm font-bold text-slate-800">BOQ Playground</div>
            <div className="text-[11px] text-slate-500 tabular-nums">{models.length} lines</div>
          </div>
        </div>

        <div className="relative" data-pg-menu>
          <button type="button" onClick={() => setMenu(m => (m === 'ver' ? null : 'ver'))} aria-expanded={menu === 'ver'} title="Versions"
            className="pl-2.5 pr-1.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-2 text-left">
            <span className={`w-2 h-2 rounded-full ${verDot}`} />
            <span className="leading-tight">
              <span className="block text-xs font-bold text-slate-800 whitespace-nowrap max-w-[160px] truncate">{tier.name}</span>
              <span className="block text-[10px] text-slate-500 whitespace-nowrap">{BOQ_FORMAT_LABEL[format]} · {readOnly ? 'Frozen' : 'Draft'}</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden />
          </button>
          {menu === 'ver' && (
            <div className="absolute left-0 top-full mt-1.5 z-40 w-[280px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 hud-panel-in">
              <div className={`${LABEL} px-3 pt-1.5 pb-1`}>Options on this project</div>
              {tiers.map(t => (
                <button key={t.id} type="button" onClick={() => { onSelectTier?.(t.id); setMenu(null); }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 ${t.id === tier.id ? 'bg-[#3D52A0]/[0.06]' : 'hover:bg-slate-50'}`}>
                  <span className={`w-2 h-2 rounded-full ${boqFormatOf(t) === 'playground' ? 'bg-[#3D52A0]' : 'bg-slate-400'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{t.name}</span>
                    <span className="block text-[11px] text-slate-500">{BOQ_FORMAT_LABEL[boqFormatOf(t)]} · {(t.boq || []).length} lines</span>
                  </span>
                  {t.id === tier.id && <Check className="w-4 h-4 text-[#3D52A0]" aria-hidden />}
                </button>
              ))}
              {format === 'classic' && !readOnly && onMakePlaygroundVersion && (
                <button type="button" onClick={() => { setMenu(null); onMakePlaygroundVersion(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-sm font-semibold text-[#3D52A0] inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4" aria-hidden />Make a Playground version
                </button>
              )}
            </div>
          )}
        </div>

        <Segmented<Lens> size="sm" label="Lens" value={lens}
          onChange={l => { setLens(l); if (l === 'plan') setFitSignal(s => s + 1); }}
          options={LENSES.map(([id, n, I, tt]) => ({ id, label: <span title={tt} className="inline-flex items-center gap-1.5"><I className="w-3.5 h-3.5" aria-hidden />{n}</span> }))} />

        {lens !== 'tune' && lens !== 'deal' && !readOnly && (
          <button type="button" onClick={() => setLibOpen(o => !o)} aria-pressed={libOpen}
            className={`${barBtn} px-3 border ${libOpen ? 'bg-[#3D52A0]/10 border-[#3D52A0]/30 text-[#3D52A0]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            <Plus className="w-3.5 h-3.5" aria-hidden /><span className="min-[1400px]:hidden">Add</span><span className="hidden min-[1400px]:inline">Add items</span>
          </button>
        )}

        <div className="relative grow basis-[150px] min-w-[150px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" aria-label="Search items"
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-xl text-sm outline-none focus:border-[#3D52A0]" />
        </div>

        {!plan && !hideFigures && (
          <span className="hidden xl:inline text-xs text-slate-500 whitespace-nowrap">
            <b className="text-slate-800 tabular-nums">{inr(totals.sell)}</b>{seesMargins ? ` · ${margin.toFixed(1)}%` : ''}
          </span>
        )}

        <button type="button" onClick={onSave} disabled={saveState === 'saving'} title="Saves now; edits also save on their own"
          className={`${barBtn} px-3 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>
          <Check className="w-3.5 h-3.5" aria-hidden /><span className="min-[1400px]:hidden">{saveState === 'saving' ? 'Saving…' : 'Save'}</span><span className="hidden min-[1400px]:inline">{saveState === 'saving' ? 'Saving…' : 'Save changes'}</span>
        </button>
        <button type="button" onClick={undo} disabled={!hist.past.length} aria-label="Undo" title="Undo (Ctrl+Z)" className="p-1.5 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30">
          <Undo2 className="w-4 h-4" aria-hidden />
        </button>
        {!readOnly && (
          <button type="button" onClick={onImport} title="Import Excel" className={`${barBtn} bg-[#3D52A0]/[0.06] border border-[#3D52A0]/20 text-[#334486]`}>
            <Upload className="w-3.5 h-3.5" aria-hidden /><span className="hidden 2xl:inline">Import Excel</span><span className="2xl:hidden">Import</span>
          </button>
        )}
        <div className="relative" data-pg-menu>
          <button type="button" onClick={() => setMenu(m => (m === 'export' ? null : 'export'))} aria-expanded={menu === 'export'} title="Export" className={`${barBtn} border border-slate-200 text-slate-700`}>
            <Download className="w-3.5 h-3.5" aria-hidden />Export<ChevronDown className="w-3 h-3" aria-hidden />
          </button>
          {menu === 'export' && (
            <div className="absolute right-0 top-full mt-1.5 z-40 w-[260px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 hud-panel-in">
              {onExportExcel && (
                <button type="button" onClick={() => { setMenu(null); onExportExcel(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-800">Excel with live formulas</span>
                  <span className="block text-[11px] text-slate-500">Every line with cost, markup and rate. Studio only.</span>
                </button>
              )}
              <button type="button" onClick={() => { setMenu(null); onExportPdf(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                <span className="block text-sm font-semibold text-slate-800">BOQ as a PDF</span>
                <span className="block text-[11px] text-slate-500">The schedule of finishes, as on screen.</span>
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setNote('The first-proposal PDF comes with the proposal part of the Playground. Export → BOQ as a PDF prints this BOQ today.')}
          title="First proposal PDF: no drawing until the layout is approved" className={`${barBtn} px-3 bg-slate-800 text-white hover:bg-slate-900`}>
          <FileText className="w-3.5 h-3.5" aria-hidden />Proposal PDF
        </button>
        <button type="button" onClick={() => { setFull(f => !f); setFitSignal(s => s + 1); }} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'} className="p-1.5 rounded-xl border border-slate-200 text-slate-600">
          {full ? <Shrink className="w-4 h-4" aria-hidden /> : <Expand className="w-4 h-4" aria-hidden />}
        </button>
      </div>

      {/* The lens and the inspector */}
      <div className="flex-1 min-h-0 grid gap-3 grid-cols-1" style={wide ? { gridTemplateColumns: showIns ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)' } : undefined}>
        <section className="relative rounded-2xl bg-white border border-slate-200 shadow-sm min-h-0 min-w-0 overflow-hidden" style={wide ? undefined : { height: '72vh', minHeight: 440 }}>
          <div className="absolute inset-0 bg-slate-100">
            {plan ? (
              planRooms.length ? (
                <PlanStage
                  ctx={ctx} rooms={rooms} boq={boq} bank={bank} bankMap={bankMap} models={byId} roomTotals={totals.byRoom}
                  readOnly={readOnly} sel={sel} onSel={pickLine} selRoom={selRoom} onSelRoom={pickRoom}
                  commit={commit} newId={newId} libOpen={showLib} hideFigures={hideFigures} fitSignal={fitSignal} prepareNew={prepareNew}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center p-6" style={{ paddingLeft: showLib && wide ? 260 : undefined }}>
                  <div className="max-w-md w-full bg-white rounded-2xl p-4 shadow-sm">
                    <EmptyState icon={MapIcon} title="No rooms on the plan yet"
                      text="Read the rooms off the brief’s plan, upload one, or lay the rooms out as blocks from their sizes. Then draw the furniture here."
                      action={<Button size="sm" variant="primary" onClick={() => setPlanModal(true)}>Set up the plan</Button>} />
                  </div>
                </div>
              )
            ) : (
              <div className="absolute inset-0 overflow-auto bg-slate-50 hud-swap" key={lens} style={{ paddingLeft: showLib && wide ? 244 : 0 }}>
                {lens === 'rooms' && (
                  <RoomsLens rooms={rooms} models={models} shares={shares} roomTotals={totals.byRoom} bankMap={bankMap} sel={sel} selRoom={selRoom}
                    readOnly={readOnly} seesMargins={seesMargins} hideFigures={hideFigures} floor={floor} query={query}
                    onSel={pickLine} onRoom={pickRoom} onAdd={onAddFromBank}
                    onShowOnPlan={name => { setLens('plan'); pickRoom(name); setFitSignal(s => s + 1); }}
                    onDropItem={(id, room) => { const it = bank.find(i => i.id === id); if (it) addToRoom(it, room); }}
                    onReplaceMany={replaceMany} />
                )}
                {lens === 'sheet' && fullGrid && renderFullGrid && (
                  <div className="p-3">
                    <div className="mb-2"><Button size="sm" onClick={() => setFullGrid(false)}>Back to the Sheet</Button></div>
                    {renderFullGrid()}
                  </div>
                )}
                {lens === 'sheet' && !(fullGrid && renderFullGrid) && (
                  <SheetLens rooms={rooms} models={models} shares={shares} roomTotals={totals.byRoom} sel={sel} readOnly={readOnly}
                    seesMargins={seesMargins} hideFigures={hideFigures} floor={floor} query={query}
                    onSel={pickLine} onReplace={l => replace(l)} onReplaceMany={replaceMany} onDelete={remove}
                    onFullGrid={renderFullGrid ? () => setFullGrid(true) : undefined}
                    specBank={specBank} onUpdateLines={offer ? updateLines : undefined} />
                )}
                {lens === 'tune' && (
                  <TuneLens boq={boq} bankMap={bankMap} rules={rules} rooms={rooms} floor={floor} floors={floors}
                    seesMargins={seesMargins} readOnly={readOnly} commit={commit} />
                )}
                {lens === 'deal' && (
                  <div className="p-6 max-w-xl"><EmptyState icon={Target} title="Deal comes next"
                    text="Offers, the design fee, GST and what the client pays, on one page. Until then, Money & Offers shows them for this option." /></div>
                )}
              </div>
            )}

            {showLib && (
              <div className="absolute left-2 top-2 bottom-2 z-20 w-[232px] flex hud-panel-in">
                <Catalogue bank={bank} readOnly={readOnly} onClose={() => setLibOpen(false)} onAdd={it => addToRoom(it, libTarget)} addLabel={`to ${libTarget}`}
                  artOf={specBank ? (it => { const r = recipeOf(it, specBank); return r ? artOfSpecs(specsFromRecipe(specBank, r, grade), specBank.materials) : {}; }) : undefined} />
              </div>
            )}

            {plan && (
              <div className="absolute top-2.5 z-10 flex items-center" style={{ left: showLib ? 248 : 10 }}>
                <span className="relative inline-block" data-pg-menu>
                  <button type="button" onClick={() => setMenu(m => (m === 'plan' ? null : 'plan'))} aria-expanded={menu === 'plan'}
                    className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl bg-white/95 border border-slate-200 shadow-sm hover:border-[#3D52A0]/40">
                    <span className="w-6 h-6 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><FileText className="w-3.5 h-3.5" aria-hidden /></span>
                    <span className="text-xs font-bold text-slate-700">{planLabel}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden />
                  </button>
                  {menu === 'plan' && (
                    <div className="absolute left-0 top-full mt-1.5 z-40 w-[300px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 hud-panel-in">
                      <div className={`${LABEL} px-3 pt-1.5 pb-1`}>The plan under this BOQ</div>
                      {([
                        [Upload, 'Replace with a new plan', 'Upload a PDF or photo. Rooms are matched by name; pieces move with their room'],
                        [MapPin, 'Read or trace the rooms', 'Rooms off the drawing, or traced by hand, or laid out as blocks'],
                        [Target, 'Set the scale again', 'Measure one wall you know'],
                        [FileText, 'Back to the brief’s plan', 'The plan the client gave with the brief'],
                      ] as [React.ElementType, string, string][]).map(([I, t, d]) => (
                        <button key={t} type="button" onClick={() => { setMenu(null); setPlanModal(true); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-start gap-2">
                          <span className="mt-0.5 text-[#3D52A0]"><I className="w-4 h-4" aria-hidden /></span>
                          <span><span className="block text-sm font-semibold text-slate-800">{t}</span><span className="block text-[11px] text-slate-500">{d}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </span>
                {readOnly && <span className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm text-xs font-bold text-slate-600"><Lock className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Read-only</span>}
                <span className="ml-1.5 inline-flex p-0.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm" role="radiogroup" aria-label="Plan layer">
                  <button type="button" role="radio" aria-checked className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#3D52A0] text-white">Interiors</button>
                  <button type="button" role="radio" aria-checked={false} onClick={() => setNote('Civil works on the plan (floors, waterproofing, walls broken and built) come with the civil part of the Playground.')}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Civil</button>
                </span>
                {waiting.length > 0 && (
                  <button type="button" onClick={() => pickLine(waiting[0].id)} className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 border border-amber-200 shadow-sm text-xs font-bold text-amber-700">
                    <MapPin className="w-3.5 h-3.5" aria-hidden />{waiting.length} need a place
                  </button>
                )}
              </div>
            )}

            {plan && (
              <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-2">
                <div className="rounded-2xl bg-white/95 border border-slate-200 shadow-md pl-2 pr-3 py-1.5 flex items-center gap-2 pointer-events-none">
                  {seesMargins && !hideFigures && <Ring margin={margin} floor={floor} />}
                  <div className="text-right">
                    <div className={LABEL}>Client pays · work</div>
                    <div className="text-base font-black text-slate-800 tabular-nums leading-tight">{hideFigures ? '••••' : inr(totals.sell)}</div>
                  </div>
                </div>
                {!showIns && (
                  <button type="button" onClick={() => setInsOpen(true)} className="rounded-2xl bg-white/95 border border-slate-200 shadow-md px-3 py-2.5 text-xs font-bold text-[#3D52A0] inline-flex items-center gap-1.5 hover:bg-white">
                    <ReceiptIcon className="w-3.5 h-3.5" aria-hidden />Live BOQ
                  </button>
                )}
              </div>
            )}

            {note && (
              <div role="status" className="absolute z-30 bottom-14 left-1/2 -translate-x-1/2 max-w-[90%] rounded-xl bg-slate-800 text-white text-xs font-semibold px-3 py-2 shadow-2xl hud-panel-in">{note}</div>
            )}
          </div>
        </section>
        {showIns && (
          <div className="min-h-0 min-w-0">
            <aside className="rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col min-h-0 h-full overflow-hidden" aria-label={selModel ? 'Line' : selRoomObj ? 'Room' : 'Live BOQ'}>
              <div className="flex-1 overflow-auto">{inspector}</div>
            </aside>
          </div>
        )}
      </div>

      {recipeItemId && specBank && bankMap.get(recipeItemId) && (
        <RecipeDrawer
          item={bankMap.get(recipeItemId)!}
          specs={specBank}
          canEditRecipes={!!canEditRecipes && !!onSaveSpecs}
          canEditItem={false}
          projects={0}
          sharedBy={rid => bank.filter(i => recipeOf(i, specBank)?.id === rid).length}
          onSave={async ({ bank: next }) => { if (next && onSaveSpecs) await onSaveSpecs(next); }}
          onClose={() => setRecipeItemId(null)}
        />
      )}

      {planModal && (
        <div className="fixed inset-0 z-[300] grid place-items-center p-4 phd-scrim" style={{ background: 'rgba(15,23,42,.45)' }} role="dialog" aria-modal="true" aria-label="The plan under this BOQ">
          <div className="phd-pop w-full max-w-[1100px] max-h-[90vh] overflow-auto rounded-3xl bg-slate-50 shadow-2xl p-4">
            <div className="flex items-center mb-3">
              <span className="text-sm font-bold text-slate-800">The plan under this BOQ</span>
              <button type="button" onClick={() => { setPlanModal(false); setFitSignal(s => s + 1); }} aria-label="Close" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
            </div>
            <PlanSheetPanel projectContext={ctx} setProjectContext={setProjectContext} tiers={tiers} setTiers={setTiers} activeTierId={tier.id} bank={bank} tenantId={tenantId} />
          </div>
        </div>
      )}
    </div>
  );
}
