/**
 * TakeoffPanel — floor-plan geometry to quantities, reviewed in one screen.
 *
 * Sits in Brief & Site, which already owns the plan and the room list. The panel is a
 * review surface, not a data-entry form: the plan supplies the numbers, and you only
 * touch the rooms it could not read cleanly.
 *
 * Every quantity shows its working. Nothing here calls an AI model — the vision pass
 * happened upstream at upload; this is arithmetic in lib/takeoff.ts.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, CheckCircle2, ArrowRight, Layers, Sparkles, AlertCircle } from 'lucide-react';
import { ProjectContext, Room, ProposalTier, Item } from '../types';
import {
  computeTakeoff, classifyRoom, defaultCeiling, DEFAULT_CONVENTIONS,
  RoomGeometry, CeilingDesign, DimSource, RoomKind, TakeoffResult,
  syncTakeoffToBoqItems, SyncTakeoffResult,
} from '../lib/takeoff';

const GLASS = "rounded-3xl bg-white/70 backdrop-blur-xl ring-1 ring-slate-900/[0.06] border border-white/70 shadow-[0_12px_40px_-18px_rgba(30,41,59,0.35)]";

const n0 = (v: number) => Math.round(v).toLocaleString('en-IN');
const ft = (v?: number) => {
  if (!v) return '—';
  const f = Math.floor(v); let i = Math.round((v - f) * 12);
  return i === 12 ? `${f + 1}′0″` : `${f}′${i}″`;
};

const SOURCE_STYLE: Record<DimSource, string> = {
  read:      'bg-emerald-50 text-emerald-700 ring-emerald-200',
  confirmed: 'bg-sky-50 text-[#0055B3] ring-sky-200',
  calculated:'bg-sky-50 text-sky-700 ring-sky-200',
  assumed:   'bg-amber-50 text-amber-700 ring-amber-200',
};
const SOURCE_LABEL: Record<DimSource, string> = {
  read: 'read', confirmed: 'confirmed', calculated: 'measured', assumed: 'assumed',
};
const CEILINGS: CeilingDesign[] = ['none', 'grid', 'plain', 'cove', 'designer'];
const KINDS: RoomKind[] = ['living','dining','bedroom','kitchen','toilet','utility','foyer','passage','balcony','other'];

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  tiers?: ProposalTier[];
  setTiers?: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  activeTierId?: string;
  bank?: Item[];
}

/** Room[] on the project → the geometry the model needs. */
function toGeometry(rooms: Room[], defaultHeight: number): RoomGeometry[] {
  return (rooms || [])
    // "Functional" and "Others" are bookkeeping buckets, not rooms; a zero-area room
    // has no geometry to work from and would render an empty row.
    .filter(r => r && r.name && !/^(functional|others|general)$/i.test(r.name.trim()))
    .filter(r => (r.size || 0) > 0 || (r.length && r.width))
    .map((r, i) => {
      const kind = r.kind || classifyRoom(r.name);
      // A room with only an area still needs L and W. Assume the studio's median
      // 1.2:1 proportion and mark it assumed, so it lands in the confirm queue.
      const hasDims = !!(r.length && r.width);
      const L = hasDims ? r.length! : Math.sqrt((r.size || 0) * 1.2);
      const W = hasDims ? r.width!  : (r.size || 0) / Math.max(L, 0.01);
      return {
        id: `${i}-${r.name}`, name: r.name, kind,
        lengthFt: +L.toFixed(2), widthFt: +W.toFixed(2),
        heightFt: r.height || defaultHeight,
        doors: r.doors ?? (kind === 'passage' ? 0 : 1),
        windows: r.windows ?? (kind === 'passage' || kind === 'foyer' ? 0 : 1),
        ceiling: r.ceiling || defaultCeiling(kind),
        source: r.dimSource || (hasDims ? 'read' : 'assumed'),
        rawDimension: r.rawDimension,
        irregular: r.irregular,
      } as RoomGeometry;
    });
}

export const TakeoffPanel: React.FC<Props> = ({ 
  projectContext, 
  setProjectContext,
  tiers,
  setTiers,
  activeTierId,
  bank,
}) => {
  const [open, setOpen] = useState<string | null>(null);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [syncedBanner, setSyncedBanner] = useState<{ count: number; tierName: string } | null>(null);
  const defaultHeight = projectContext.takeoff?.defaultHeightFt || projectContext.ceilingHeight || 9;

  const activeTier = tiers?.find(t => t.id === activeTierId) || tiers?.[0];

  const geometry = useMemo(
    () => toGeometry(projectContext.rooms || [], defaultHeight),
    [projectContext.rooms, defaultHeight]);

  const result: TakeoffResult = useMemo(
    () => computeTakeoff(
      geometry,
      { ...DEFAULT_CONVENTIONS, ...(projectContext.takeoff?.conventions || {}) },
      projectContext.takeoff?.statedCarpetSft || projectContext.area || undefined),
    [geometry, projectContext.takeoff, projectContext.area]);

  // Live preview of matches for active tier
  const livePreview = useMemo(() => {
    if (!activeTier?.items || !bank || !geometry.length) return null;
    return syncTakeoffToBoqItems(
      activeTier.items,
      geometry,
      bank,
      { ...DEFAULT_CONVENTIONS, ...(projectContext.takeoff?.conventions || {}) },
      projectContext.takeoff?.statedCarpetSft || projectContext.area || undefined
    );
  }, [activeTier?.items, bank, geometry, projectContext.takeoff, projectContext.area]);

  const handleSyncToBoq = (target: 'active' | 'all') => {
    if (!tiers || !setTiers || !bank || !geometry.length) return;

    const conventions = { ...DEFAULT_CONVENTIONS, ...(projectContext.takeoff?.conventions || {}) };
    const carpet = projectContext.takeoff?.statedCarpetSft || projectContext.area || undefined;

    let totalUpdatedCount = 0;

    const updatedTiers = tiers.map(tier => {
      if (target === 'active' && tier.id !== activeTier?.id) {
        return tier;
      }
      const res = syncTakeoffToBoqItems(tier.items || [], geometry, bank, conventions, carpet);
      totalUpdatedCount += res.matchedCount;
      return {
        ...tier,
        items: res.updatedItems
      };
    });

    setTiers(updatedTiers);
    setSyncedBanner({
      count: totalUpdatedCount,
      tierName: target === 'active' ? (activeTier?.name || 'Active Tier') : 'All Tiers'
    });
    setTimeout(() => {
      setSyncedBanner(null);
    }, 6000);
  };

  /** Writes back to the room, and marks it confirmed — a human has now seen it. */
  const patchRoom = (name: string, patch: Partial<Room>, confirm = true) => {
    setProjectContext(prev => ({
      ...prev,
      rooms: (prev.rooms || []).map(r =>
        r.name === name
          ? { ...r, ...patch, ...(confirm ? { dimSource: 'confirmed' as DimSource } : {}),
              size: patch.length != null || patch.width != null
                ? +(((patch.length ?? r.length) || 0) * ((patch.width ?? r.width) || 0)).toFixed(2)
                : r.size }
          : r),
    }));
  };

  const setHeight = (h: number) =>
    setProjectContext(prev => ({ ...prev, takeoff: { ...(prev.takeoff || {}), defaultHeightFt: h } }));

  const t = result.totals;
  const errors = result.issues.filter(i => i.severity === 'error');
  const warns = result.issues.filter(i => i.severity === 'warn');
  const readCount = geometry.filter(g => g.source === 'read' || g.source === 'confirmed').length;

  if (!geometry.length) {
    return (
      <div className={`${GLASS} p-8 text-center`}>
        <div className="text-sm font-bold text-slate-900">No rooms yet</div>
        <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
          Upload a floor plan in project setup, or add rooms in the brief. Once rooms carry
          dimensions, painting, false ceiling and tiling quantities are derived automatically.
        </p>
      </div>
    );
  }

  const QUANTS: { label: string; value: number; unit: string; note: string }[] = [
    { label: 'Wall painting',    value: t.wallPaintSft,    unit: 'sft',
      note: 'perimeter × height, less openings and tiled surfaces' },
    { label: 'Ceiling painting', value: t.ceilingPaintSft, unit: 'sft',
      note: 'false-ceiling surface where present, slab where not' },
    { label: 'False ceiling',    value: t.falseCeilingSft, unit: 'sft',
      note: `${n0(t.fcSoffitSft)} soffit + ${n0(t.fcFacesSft)} drop and cove faces` },
    { label: 'Floor tiling',     value: t.floorTileSft,    unit: 'sft', note: 'room areas plus wastage' },
    { label: 'Wall tiling',      value: t.wallTileSft,     unit: 'sft', note: 'toilets full height, kitchen band' },
    { label: 'Skirting',         value: t.skirtingRft,     unit: 'rft', note: 'dry rooms, less door widths' },
  ];

  return (
    <div className="space-y-5">
      {/* ── reconciliation ── */}
      <div className={`${GLASS} p-5`}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Carpet from plan</span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{n0(t.carpetSft)}<span className="text-xs text-slate-400 font-medium ml-1">sft</span></span>
          </div>
          {result.reconciliationPct != null && (
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Against record</span>
              <span className={`text-2xl font-bold tabular-nums ${Math.abs(result.reconciliationPct) <= 5 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {result.reconciliationPct > 0 ? '+' : ''}{result.reconciliationPct.toFixed(1)}%
              </span>
            </div>
          )}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Read from plan</span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{readCount}<span className="text-sm text-slate-400 font-medium">/{geometry.length}</span></span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ceiling ht</label>
            <input type="number" step="0.5" value={defaultHeight}
              onChange={e => setHeight(Number(e.target.value) || 9)}
              className="w-16 text-sm font-bold text-slate-900 tabular-nums bg-white/80 rounded-lg px-2 py-1.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-[#0066CC] outline-none" />
            <span className="text-xs text-slate-400">ft</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          A floor plan is 2D and cannot carry ceiling height — it is the one figure the takeoff needs from you.
          Everything else comes from the drawing.
        </p>
      </div>

      {/* ── issues ── */}
      <AnimatePresence>
        {(errors.length > 0 || warns.length > 0) && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-2xl p-4 ring-1 ${errors.length ? 'bg-rose-50/80 ring-rose-200' : 'bg-amber-50/80 ring-amber-200'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${errors.length ? 'text-rose-700' : 'text-amber-700'}`}>
              {errors.length ? 'Needs attention' : 'Worth a glance'}
            </div>
            <ul className="space-y-1.5">
              {[...errors, ...warns].map((i, k) => (
                <li key={k} className={`text-xs leading-relaxed ${errors.length ? 'text-rose-800' : 'text-amber-800'}`}>{i.message}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── derived quantities ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {QUANTS.map(q => (
          <div key={q.label} className={`${GLASS} p-4`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{q.label}</span>
            <span className="text-[26px] leading-tight font-bold text-slate-900 tabular-nums">
              {n0(q.value)}<span className="text-[11px] text-slate-400 font-medium ml-1">{q.unit}</span>
            </span>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">{q.note}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 px-1">
        <span>Profile / fold <b className="text-slate-800 tabular-nums">{n0(t.profileRft)}</b> rft</span>
        <span>Cove channel <b className="text-slate-800 tabular-nums">{n0(t.coveChannelRft)}</b> rft</span>
        <span>Light cutouts <b className="text-slate-800 tabular-nums">{t.lightCutouts}</b> nos</span>
      </div>

      {/* ── SYNC TO BOQ ACTION CARD ── */}
      {tiers && setTiers && (
        <div className="rounded-2xl bg-gradient-to-r from-sky-50/90 via-indigo-50/70 to-blue-50/90 p-5 ring-1 ring-[#0066CC]/20 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-[#0066CC] text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Sync Takeoff Quantities into BOQ</h4>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#0066CC]/10 text-[#0066CC]">
                    Live Engine
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {livePreview && livePreview.matchedCount > 0 ? (
                    <span>
                      <b className="text-[#0066CC] font-bold">{livePreview.matchedCount} line items</b> in <i>{activeTier?.name || 'Active Tier'}</i> can be automatically updated with exact mathematical derivations.
                    </span>
                  ) : (
                    <span>All matching BOQ line items currently match floor-plan geometry.</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              {livePreview && livePreview.details.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSyncDetails(!showSyncDetails)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white/80 hover:bg-white border border-slate-200 shadow-2xs transition-all cursor-pointer"
                >
                  {showSyncDetails ? 'Hide Matches' : `View Matches (${livePreview.details.length})`}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSyncToBoq('active')}
                disabled={!livePreview || livePreview.matchedCount === 0}
                className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer ${
                  livePreview && livePreview.matchedCount > 0
                    ? 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync {activeTier?.name || 'Active BOQ'}
              </button>

              {tiers.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleSyncToBoq('all')}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-[#0066CC] bg-white/90 hover:bg-white border border-[#0066CC]/30 shadow-2xs transition-all cursor-pointer"
                  title="Sync takeoff across all proposal tiers"
                >
                  All Tiers ({tiers.length})
                </button>
              )}
            </div>
          </div>

          {/* Success toast / banner */}
          <AnimatePresence>
            {syncedBanner && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-xs font-medium"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Successfully synced <b>{syncedBanner.count} BOQ line items</b> in <b>{syncedBanner.tierName}</b> with floor-plan takeoff quantities!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Matched Details Drawer */}
          <AnimatePresence>
            {showSyncDetails && livePreview && livePreview.details.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden rounded-xl bg-white border border-slate-200/80 mt-2"
              >
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Takeoff Item Mapping Preview</span>
                  <span>{livePreview.details.length} Items Found</span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {livePreview.details.map((d, idx) => (
                    <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{d.itemName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-[#0066CC] font-semibold border border-sky-100">
                            {d.roomName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{d.derivation}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono">
                        <span className="text-slate-400 line-through tabular-nums">{d.oldQty} {d.unit}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="font-bold text-[#0066CC] tabular-nums">{d.newQty} {d.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── rooms ── */}
      <div className={`${GLASS} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-slate-200/70 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rooms read from the plan</span>
          <span className="text-[10px] text-slate-400">click a room to correct it</span>
        </div>
        <div className="divide-y divide-slate-200/60">
          {result.rooms.map(rt => {
            const r = rt.room;
            const isOpen = open === r.id;
            const src = r.source as DimSource;
            return (
              <div key={r.id}>
                <button onClick={() => setOpen(isOpen ? null : r.id)}
                  className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors ${isOpen ? 'bg-sky-50/60' : 'hover:bg-white/60'}`}>
                  <span className="font-bold text-[13px] text-slate-900 flex-1 truncate">{r.name}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums font-mono hidden sm:block">
                    {ft(r.lengthFt)} × {ft(r.widthFt)}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums w-14 text-right">{n0(rt.areaSft)} sft</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ${SOURCE_STYLE[src]}`}>
                    {SOURCE_LABEL[src]}
                  </span>
                  <span className={`text-slate-300 text-[10px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-white/50">
                      <div className="px-5 py-4">
                        {r.rawDimension && (
                          <div className="text-[11px] text-slate-500 mb-3">
                            Printed on the drawing: <span className="font-mono text-slate-800">{r.rawDimension}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                          {([['Length', 'length', r.lengthFt], ['Width', 'width', r.widthFt],
                             ['Height', 'height', r.heightFt], ['Doors', 'doors', r.doors],
                             ['Windows', 'windows', r.windows]] as const).map(([label, key, val]) => (
                            <div key={key}>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{label}</label>
                              <input type="number" step={key === 'doors' || key === 'windows' ? 1 : 0.25} value={val}
                                onChange={e => patchRoom(r.name, { [key]: Number(e.target.value) } as Partial<Room>)}
                                className="w-full text-sm font-mono tabular-nums bg-white rounded-lg px-2 py-1.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-[#0066CC] outline-none" />
                            </div>
                          ))}
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Ceiling</label>
                            <select value={r.ceiling}
                              onChange={e => patchRoom(r.name, { ceiling: e.target.value as CeilingDesign }, false)}
                              className="w-full text-sm bg-white rounded-lg px-2 py-1.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-[#0066CC] outline-none capitalize">
                              {CEILINGS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Type</label>
                            <select value={r.kind}
                              onChange={e => patchRoom(r.name, { kind: e.target.value as RoomKind }, false)}
                              className="text-xs bg-white rounded-lg px-2 py-1 ring-1 ring-slate-200 outline-none capitalize">
                              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={!!r.irregular}
                              onChange={e => patchRoom(r.name, { irregular: e.target.checked }, false)}
                              className="rounded border-slate-300" />
                            L-shaped / irregular
                          </label>
                        </div>

                        {/* the working, per room */}
                        <div className="mt-4 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200/70">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">How this room resolves</div>
                          <div className="font-mono text-[10px] text-slate-500 leading-relaxed">{rt.derivation}</div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5 text-[11px]">
                            {[['Wall paint', rt.wallPaintSft, 'sft'], ['Ceiling paint', rt.ceilingPaintSft, 'sft'],
                              ['False ceiling', rt.falseCeilingSft, 'sft'], ['Floor tile', rt.floorTileSft, 'sft'],
                              ['Wall tile', rt.wallTileSft, 'sft'], ['Skirting', rt.skirtingRft, 'rft'],
                              ['Profile', rt.profileRft, 'rft'], ['Cutouts', rt.lightCutouts, 'nos'],
                            ].map(([l, v, u]) => (
                              <div key={l as string} className="flex justify-between">
                                <span className="text-slate-400">{l as string}</span>
                                <span className="font-mono tabular-nums text-slate-800 font-semibold">
                                  {n0(v as number)}<span className="text-slate-400 font-normal ml-0.5">{u as string}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 px-1 leading-relaxed">
        These quantities flow into the BOQ when you add a painting, false-ceiling or tiling item to a room —
        each arrives pre-filled with the working shown above. Rooms without dimensions fall back to the
        studio's ratios and are labelled as such.
      </p>
    </div>
  );
};

export default TakeoffPanel;
