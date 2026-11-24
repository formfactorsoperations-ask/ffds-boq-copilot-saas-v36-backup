import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, LABEL, INPUT, Segmented } from '../ui/kit';
import type { Item, Room } from '../../types';
import { calculateSellPrice } from '../../lib/utils';
import { customItem, customDefaults, measuresFor, suggestMeasure, measureRoom, type CustomInput, type MeasureBy } from '../../lib/playground/custom';
import { inr } from './playgroundUi';
import '../projectHeader/projectHeader.css';

/*
  A custom item: something the Item Bank does not have, added straight to the
  BOQ. Its name, the room, its trade and unit, how many, and its price: the
  studio's finance roles give its cost and margin; everyone else gives the rate
  the client pays, and the trade's usual margin stands behind it. It is kept
  with the project (adHocItems), so it prices everywhere a bank item does.
*/
export default function CustomItemModal({ bank, rooms, room, name: name0 = '', cat: cat0, work = false, roomOf, seesMargins, rounded, newId, onAdd, onClose }: {
  bank: Item[];
  rooms: string[];
  /** The room it goes to unless another is picked. */
  room: string;
  /** What was typed in the library's filter. */
  name?: string;
  /** The trade the library tab suggests. */
  cat?: string;
  /** Opened from Works: a work measured from its room (by area, unless another unit is picked). */
  work?: boolean;
  /** A room, to measure a work from. */
  roomOf?: (name: string) => Room | undefined;
  /** The studio's finance roles: cost and margin; others: the client's rate. */
  seesMargins: boolean;
  /** A Playground version rounds each amount up to ₹100. */
  rounded: boolean;
  newId: () => string;
  /** The item, its quantity, its room, and how the quantity was measured (if it was). */
  onAdd: (item: Item, qty: number, room: string, how?: string) => void;
  onClose: () => void;
}) {
  const d = useMemo(() => customDefaults(bank), [bank]);
  const [f, setF] = useState<CustomInput>({
    name: name0, room: rooms.includes(room) ? room : rooms[0] || 'Others', cat: cat0 && d.cats.includes(cat0) ? cat0 : d.cats[0] || 'Others',
    unit: work ? (d.units.find(u => /sq\s*ft/i.test(u)) || 'sq ft') : 'nos', qty: work ? 0 : 1, specs: '', rate: 0, materials: 0, labor: 0, margin: d.marginFor(cat0 && d.cats.includes(cat0) ? cat0 : d.cats[0] || 'Others'),
  });
  const set = <K extends keyof CustomInput>(k: K, v: CustomInput[K]) => setF(p => ({ ...p, [k]: v, ...(k === 'cat' ? { margin: d.marginFor(String(v)) } : {}) }));
  /* A work by area or length is measured from its room unless the quantity is typed. */
  const [typed, setTyped] = useState(!work);
  const [by, setBy] = useState<MeasureBy | null>(null);
  const can = measuresFor(f.unit);
  const pick: MeasureBy | null = by && can.some(m => m.id === by) ? by : (suggestMeasure(f.name, f.unit) || can[0]?.id || null);
  const measured = pick && can.length ? measureRoom(pick, roomOf?.(f.room)) : null;
  const measuring = !typed && !!measured;
  const qty = measuring ? measured!.qty : f.qty;
  const made = customItem({ ...f, qty }, seesMargins ? 'cost' : 'rate', newId);
  const rate = made.ok ? calculateSellPrice(made.item.materials, made.item.labor, made.item.margin) : 0;
  const amount = rate * (qty || 0);
  const shown = rounded ? Math.ceil(Math.round(amount * 100) / 100 / 100 - 1e-9) * 100 : amount;
  const num = (v: string) => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Add a custom item">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <form className="phd-pop relative w-full max-w-[560px] max-h-[90vh] overflow-auto rounded-3xl bg-white border border-slate-200 shadow-2xl"
        onSubmit={e => { e.preventDefault(); if (made.ok) onAdd(made.item, qty, f.room, measuring ? measured!.how : undefined); }}>
        <div className="px-6 pt-5 pb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Not in the Item Bank</div>
            <h2 className="text-lg font-bold text-slate-800">{work ? 'Add a custom work' : 'Add a custom item'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">It goes straight into this BOQ and is kept with the project. The Item Bank keeps a copy too, so it can be picked again.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="px-6 pb-5 grid grid-cols-2 gap-x-4 gap-y-3">
          <label className="col-span-2 block"><span className={`${LABEL} block mb-1.5`}>Item name</span>
            <input autoFocus value={f.name} onChange={e => set('name', e.target.value)} placeholder="Fluted feature wall with brass inlay" className={INPUT} /></label>
          <label className="block"><span className={`${LABEL} block mb-1.5`}>Room</span>
            <select value={f.room} onChange={e => set('room', e.target.value)} className={INPUT}>{rooms.map(r => <option key={r}>{r}</option>)}</select></label>
          <label className="block"><span className={`${LABEL} block mb-1.5`}>Trade</span>
            <select value={f.cat} onChange={e => set('cat', e.target.value)} className={INPUT}>{d.cats.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="block"><span className={`${LABEL} block mb-1.5`}>Unit</span>
            <select value={f.unit} onChange={e => set('unit', e.target.value)} className={INPUT}>{d.units.map(u => <option key={u}>{u}</option>)}</select></label>
          {can.length > 0 && roomOf?.(f.room) && measureRoom(can[0].id, roomOf(f.room)) ? (
            <div className="block"><span className={`${LABEL} block mb-1.5`}>Quantity</span>
              <Segmented<'measure' | 'type'> size="sm" label="Quantity" value={typed ? 'type' : 'measure'} onChange={v => setTyped(v === 'type')}
                options={[{ id: 'measure', label: 'Measure from the room' }, { id: 'type', label: 'Type it' }]} /></div>
          ) : <div className="hidden sm:block" />}
          {measuring ? (
            <div className="col-span-2 grid grid-cols-2 gap-x-4 items-end" data-measured>
              <label className="block"><span className={`${LABEL} block mb-1.5`}>Measure</span>
                <select value={pick || ''} onChange={e => setBy(e.target.value as MeasureBy)} className={INPUT}>{can.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <div className="pb-2 text-xs text-slate-500"><b className="text-slate-800 tabular-nums">{measured!.qty} {f.unit}</b>: {measured!.how}, in {f.room}</div>
            </div>
          ) : (
            <label className="block"><span className={`${LABEL} block mb-1.5`}>{can.length ? 'Quantity, typed' : 'Quantity'}</span>
              <input inputMode="decimal" value={f.qty || ''} onChange={e => set('qty', num(e.target.value))} placeholder="1" className={`${INPUT} tabular-nums`} /></label>
          )}

          {seesMargins ? (<>
            <label className="block"><span className={`${LABEL} block mb-1.5`}>Material cost per {f.unit}</span>
              <input inputMode="decimal" value={f.materials || ''} onChange={e => set('materials', num(e.target.value))} placeholder="0" className={`${INPUT} tabular-nums`} /></label>
            <label className="block"><span className={`${LABEL} block mb-1.5`}>Labour per {f.unit}</span>
              <input inputMode="decimal" value={f.labor || ''} onChange={e => set('labor', num(e.target.value))} placeholder="0" className={`${INPUT} tabular-nums`} /></label>
            <label className="block"><span className={`${LABEL} block mb-1.5`}>Margin %</span>
              <input inputMode="decimal" value={f.margin} onChange={e => set('margin', num(e.target.value))} className={`${INPUT} tabular-nums`} /></label>
            <div className="self-end pb-2 text-xs text-slate-500">Client rate <b className="text-slate-800 tabular-nums">{inr(rate)}</b> per {f.unit}</div>
          </>) : (
            <label className="col-span-2 block"><span className={`${LABEL} block mb-1.5`}>Rate to the client per {f.unit}</span>
              <input inputMode="decimal" value={f.rate || ''} onChange={e => set('rate', num(e.target.value))} placeholder="0" className={`${INPUT} tabular-nums`} /></label>
          )}

          <label className="col-span-2 block"><span className={`${LABEL} block mb-1.5`}>What the client reads <span className="normal-case tracking-normal font-semibold text-slate-400">· optional</span></span>
            <textarea rows={2} value={f.specs} onChange={e => set('specs', e.target.value)} placeholder="Materials, finish, brand" className={`${INPUT} resize-none`} /></label>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="text-xs text-slate-600 min-w-0 flex-1" role="status">
            {made.ok
              ? <>Comes to <b className="text-slate-800 tabular-nums">{inr(shown)}</b> for {qty} {f.unit}{rounded && shown !== amount ? ', rounded up to ₹100 like every line' : ''}.</>
              : 'problem' in made ? made.problem : ''}
          </div>
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!made.ok}>Add to {f.room}</Button>
        </div>
      </form>
    </div>
  );
}
