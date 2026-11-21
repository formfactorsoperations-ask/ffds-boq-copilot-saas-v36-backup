import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Item, ProjectContext, BoqItem } from '../../types';
import { TemplateData, generateStandardPackages } from '../../lib/standardPackages';
import { formatINR } from '../../lib/utils';
import { lineSellRate } from '../../lib/boqPricing';
import { Sprout, Gem, Crown, ChevronDown } from 'lucide-react';
import BankModal from '../bank/BankModal';
import { Button, Chip, Segmented, EmptyState, INPUT, LABEL } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import { IconTile } from '../people/PeopleBits';

/*
  Standard templates → Preview the options: the three options this typology
  makes for a home of a given size, side by side, from the same generator a
  new project uses (lib/standardPackages).

  Each option used to list its lines in a box 420px high with the names cut
  short. The window scrolls now, a room opens to its lines, and a line's
  amount is the rate the generator gave that line (lib/boqPricing
  lineSellRate): it was worked out from the Item bank's rate, so the lines of
  Essential and Harmony did not add up to the totals above them.
*/

interface TemplateThreeTierPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  configName: string;
  templates: TemplateData;
  bank: Item[];
}

type ViewMode = 'by_room' | 'flat';

const AREAS = [650, 1000, 1450, 2200];
/* The medals Pricing & Tiers gives its options, by place in price. */
const MEDAL = [Sprout, Gem, Crown];

export const TemplateThreeTierPreviewModal: React.FC<TemplateThreeTierPreviewModalProps> = ({
  isOpen,
  onClose,
  configName,
  templates,
  bank
}) => {
  const [carpetArea, setCarpetArea] = useState(1000);
  const [areaDraft, setAreaDraft] = useState<string | null>(null);
  const [ceilingHeight, setCeilingHeight] = useState(9.5);
  const [heightDraft, setHeightDraft] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('by_room');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');
  /* Rooms shut, by "option|room". They start open: the point is to see the lines. */
  const [shut, setShut] = useState<Set<string>>(new Set());

  const bankMap = useMemo(() => new Map<string, Item>(bank.map(i => [i.id, i])), [bank]);

  const simulatedContext: ProjectContext = useMemo(() => ({
    name: 'Simulated Client Apartment',
    type: 'TURNKEY',
    area: carpetArea,
    ceilingHeight: ceilingHeight,
    config: configName,
    rooms: []
  }), [carpetArea, ceilingHeight, configName]);

  const generatedTiers = useMemo(() => {
    if (!isOpen) return [];
    try {
      return generateStandardPackages(simulatedContext, bank, templates, 'tiered');
    } catch (e) {
      console.error("Simulation failed:", e);
      return [];
    }
  }, [isOpen, simulatedContext, bank, templates]);

  // Extract unique room names across all tiers for filter
  const allRooms = useMemo(() => {
    const set = new Set<string>();
    generatedTiers.forEach(tier => {
      tier.boq.forEach(item => {
        if (item.roomId) set.add(item.roomId);
      });
    });
    return Array.from(set);
  }, [generatedTiers]);

  if (!isOpen) return null;

  const amountOf = (line: BoqItem) => {
    const item = bankMap.get(line.bankId);
    return item ? lineSellRate(line, item) * line.qty : 0;
  };
  const toggle = (key: string) => setShut(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const lineRow = (line: BoqItem, key: React.Key, showRoom?: boolean) => {
    const item = bankMap.get(line.bankId);
    return (
      <li key={key} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
        <span className="min-w-0">
          <span className="block font-semibold text-slate-800 break-words">{item ? item.name : line.bankId}</span>
          <span className="block text-[11px] text-slate-500">{[showRoom ? line.roomId : null, item?.cat || 'General'].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="text-right shrink-0">
          <span className="block font-bold text-slate-800 tabular-nums">{formatINR(amountOf(line))}</span>
          <span className="block text-[11px] text-slate-500 tabular-nums">{line.qty} {item?.unit}</span>
        </span>
      </li>
    );
  };

  return (
    <BankModal
      label="Preview the options" eyebrow={`Standard templates · ${configName}`} title="Preview the options"
      blurb="The three options this typology makes for a home of this size, from the same generator a new project uses. Nothing is saved."
      size="3xl" onClose={onClose}
      tools={
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="block">
            <span className={`${LABEL} block mb-1.5`}>Carpet area, sq ft</span>
            <input type="number" min={200} value={areaDraft ?? String(carpetArea)}
              onFocus={(e) => { setAreaDraft(String(carpetArea)); e.currentTarget.select(); }}
              onChange={(e) => { setAreaDraft(e.target.value); const n = Number(e.target.value); if (n >= 200) setCarpetArea(n); }}
              onBlur={() => setAreaDraft(null)}
              className={`${INPUT} !w-28 !py-1.5 font-bold tabular-nums`} />
          </label>
          <div role="group" aria-label="Usual sizes" className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => (
              <button key={a} type="button" aria-pressed={carpetArea === a} onClick={() => { setAreaDraft(null); setCarpetArea(a); }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold tabular-nums transition-colors motion-safe:active:scale-[0.97] ${carpetArea === a ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}>
                {a.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <label className="block">
            <span className={`${LABEL} block mb-1.5`}>Ceiling, ft</span>
            <input type="number" step="0.5" min={7} value={heightDraft ?? String(ceilingHeight)}
              onFocus={(e) => { setHeightDraft(String(ceilingHeight)); e.currentTarget.select(); }}
              onChange={(e) => { setHeightDraft(e.target.value); const n = Number(e.target.value); if (n >= 7) setCeilingHeight(n); }}
              onBlur={() => setHeightDraft(null)}
              className={`${INPUT} !w-20 !py-1.5 font-bold tabular-nums`} />
          </label>
          <span className="ml-auto flex flex-wrap items-end gap-3">
            {allRooms.length > 1 && (
              <label className="block">
                <span className={`${LABEL} block mb-1.5`}>Room</span>
                <select value={selectedRoomFilter} onChange={(e) => setSelectedRoomFilter(e.target.value)} className={`${INPUT} !w-auto !py-1.5 bg-white cursor-pointer`}>
                  <option value="all">All {allRooms.length} rooms</option>
                  {allRooms.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            <Segmented size="sm" label="How to list the lines" value={viewMode} onChange={setViewMode}
              options={[{ id: 'by_room', label: 'By room' }, { id: 'flat', label: 'One list' }]} />
          </span>
        </div>
      }
      footer={
        <>
          <span className="text-[11px] text-slate-500">From the Item bank's rates, Option setup and each room's share of the area.</span>
          <Button variant="primary" onClick={onClose}>Close</Button>
        </>
      }
    >
      {generatedTiers.length === 0 ? (
        <EmptyState icon={Gem} title="No options could be made" text="This typology has no items the generator can price. Add items to its rooms first." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {generatedTiers.map((tier, idx) => {
            const sell = tier.summary.totalSell || 0;
            const cost = tier.summary.totalCost || 0;
            const margin = tier.summary.blendedGm || 0;
            const perSqft = carpetArea > 0 ? Math.round(sell / carpetArea) : 0;
            const lines = selectedRoomFilter === 'all' ? tier.boq : tier.boq.filter(b => b.roomId === selectedRoomFilter);
            const byRoom: Record<string, BoqItem[]> = {};
            lines.forEach(l => { (byRoom[l.roomId || 'General'] ||= []).push(l); });

            return (
              <motion.article key={tier.name} aria-label={tier.name}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: idx * 0.07 }}
                className={`group relative bg-white rounded-2xl border shadow-sm ${idx === 1 ? 'border-[#3D52A0] ring-4 ring-[#3D52A0]/10' : 'border-slate-200'}`}>
                {idx === 1 && <span className="absolute inset-x-5 top-0 h-1 rounded-b-full bg-[#3D52A0]" />}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-start gap-3">
                    <IconTile icon={MEDAL[idx] || Gem} tone={idx === 1 ? 'brand' : 'slate'} />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-800">{tier.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{tier.desc || 'Standard option'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div>
                      <span className={`${LABEL} block`}>Quote</span>
                      <span className="block text-xl font-black text-slate-800 tabular-nums leading-tight"><CountUp value={sell} format={(v) => formatINR(Math.round(v))} /></span>
                      <span className="block text-[11px] text-slate-500 tabular-nums">₹{perSqft.toLocaleString('en-IN')} per sq ft</span>
                    </div>
                    <div className="text-right">
                      <span className={`${LABEL} block`}>Margin</span>
                      <span className={`block text-sm font-black tabular-nums ${margin >= 20 ? 'text-emerald-700' : margin >= 15 ? 'text-amber-700' : 'text-rose-700'}`}>{margin.toFixed(1)}%</span>
                      <span className="block text-[11px] text-slate-500 tabular-nums">Cost {formatINR(cost)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className={LABEL}>What it includes</span>
                    <Chip tone="slate">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</Chip>
                  </div>
                  {lines.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">Nothing in this room for this option.</p>}

                  {viewMode === 'by_room' ? (
                    Object.entries(byRoom).map(([roomName, items]) => {
                      const key = `${idx}|${roomName}`;
                      const open = !shut.has(key);
                      const roomTotal = items.reduce((sum, l) => sum + amountOf(l), 0);
                      return (
                        <div key={roomName} className="rounded-xl border border-slate-200">
                          <button type="button" onClick={() => toggle(key)} aria-expanded={open}
                            className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left bg-slate-50 transition-colors hover:bg-slate-100 ${open ? 'rounded-t-xl border-b border-slate-100' : 'rounded-xl'}`}>
                            <span className="flex items-center gap-1.5 min-w-0">
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} aria-hidden />
                              <span className="text-xs font-semibold text-slate-800 truncate">{roomName}</span>
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{items.length}</span>
                            </span>
                            <span className="text-xs font-bold text-slate-800 tabular-nums shrink-0">{formatINR(roomTotal)}</span>
                          </button>
                          {open && <ul className="divide-y divide-slate-100">{items.map((l, i) => lineRow(l, l.id || i))}</ul>}
                        </div>
                      );
                    })
                  ) : lines.length > 0 && (
                    <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">{lines.map((l, i) => lineRow(l, l.id || i, true))}</ul>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </BankModal>
  );
};
