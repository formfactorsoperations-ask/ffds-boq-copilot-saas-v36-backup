import React, { useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { EmptyState, LABEL, INPUT } from '../ui/kit';
import type { BoqItem, Item, PricingRules, Room } from '../../types';
import { SCOPE_BUCKETS } from '../../lib/scopeBuckets';
import { lineAmount, lineCost } from '../../lib/playground/pricing';
import { markupForMargin, markupOf, type MarginFloors } from '../../lib/playground/issues';
import { fitToNumber, tunable, workTotal } from '../../lib/playground/tune';
import { inr, lakh } from './playgroundUi';

/*
  The Tune lens (BOQ Playground PR 4, the approved mockup's mixing desk).

  A fader per room, and one for every room, sets the room's average markup;
  its lines keep their spread. Beside each, a meter of the margin it makes, and
  the studio's floor drawn across the track. One drag is one undo.

  The client's number: type what the client should pay for the work, and every
  markup moves by one factor to meet it, never under a category's floor. When
  the floors stop it short, it says by how much.
*/

const FH = 170;
const MAX = 50;

interface Group { id: string; name: string; lines: BoqItem[] }

export default function TuneLens({ boq, bankMap, rules, rooms, floor, floors, seesMargins, readOnly, commit }: {
  boq: BoqItem[];
  bankMap: Map<string, Item>;
  rules: PricingRules | null;
  rooms: Room[];
  /** The studio's default margin floor, %. */
  floor: number;
  floors?: MarginFloors | null;
  seesMargins: boolean;
  readOnly: boolean;
  /** Writes the BOQ, as one undo. */
  commit: (next: BoqItem[], msg?: string) => void;
}) {
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [preview, setPreview] = useState<BoqItem[] | null>(null);
  const drag = useRef<{ ids: Set<string>; y0: number; v0: number } | null>(null);
  const lines = preview || boq;
  const ctx = useMemo(() => ({ bankMap, rules, rooms, floors }), [bankMap, rules, rooms, floors]);
  const floorMk = markupForMargin(floor);

  /* Each room's tunable lines, in the rooms' order, then the scopes. */
  const groups: Group[] = useMemo(() => {
    const t = lines.filter(l => tunable(l, bankMap) && l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted');
    const names = [...rooms.map(r => r.name), ...SCOPE_BUCKETS, ...t.map(l => l.roomId || 'Others')].filter((n, i, a) => a.indexOf(n) === i);
    return names.map(n => ({ id: n, name: n, lines: t.filter(l => (l.roomId || 'Others') === n) })).filter(g => g.lines.length);
  }, [lines, rooms, bankMap]);
  const all: Group = useMemo(() => ({ id: '__all', name: 'Every room', lines: groups.flatMap(g => g.lines) }), [groups]);

  const statsOf = (ls: BoqItem[]) => {
    let sell = 0, cost = 0, w = 0, wm = 0;
    ls.forEach(l => {
      const c = lineCost(l, bankMap);
      sell += lineAmount(l, bankMap, { rules, rooms });
      cost += c; w += c; wm += c * markupOf(l, bankMap.get(l.bankId));
    });
    return { sell, markup: w ? wm / w : 0, margin: sell > 0 ? ((sell - cost) / sell) * 100 : 0 };
  };
  const total = workTotal(lines, ctx);
  const allStats = statsOf(all.lines);

  if (!seesMargins) {
    return <div className="p-6 max-w-xl"><EmptyState icon={SlidersHorizontal} title="Studio figures are hidden" text="Markups and margins are for the studio’s finance roles, and stay hidden while figures are hidden." /></div>;
  }

  /* The group's lines at an average markup, their spread kept. */
  const withAverage = (base: BoqItem[], ids: Set<string>, to: number) => {
    const ls = base.filter(l => ids.has(l.id));
    const now = statsOf(ls).markup;
    const k = now > 0.01 ? to / now : 0;
    return base.map(l => {
      if (!ids.has(l.id)) return l;
      const mk = markupOf(l, bankMap.get(l.bankId));
      const next = Math.max(0, Math.min(400, now > 0.01 ? mk * k : to));
      return { ...l, marginOverride: Math.round(next * 100) / 100 };
    });
  };

  const down = (e: React.PointerEvent, g: Group) => {
    if (readOnly) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { ids: new Set(g.lines.map(l => l.id)), y0: e.clientY, v0: statsOf(g.lines).markup };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;
    if (Math.abs(dy) < 2 && !preview) return;
    const v = Math.max(0, Math.min(MAX, d.v0 + (dy / FH) * MAX));
    setPreview(withAverage(boq, d.ids, v));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && preview) commit(preview);
    setPreview(null);
  };
  const key = (e: React.KeyboardEvent, g: Group) => {
    if (readOnly || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const v = statsOf(g.lines).markup + (e.key === 'ArrowUp' ? 0.5 : -0.5) * (e.shiftKey ? 4 : 1);
    commit(withAverage(boq, new Set(g.lines.map(l => l.id)), Math.max(0, Math.min(MAX, v))));
  };

  const fit = () => {
    const n = Number(String(target).replace(/[₹,\s]/g, ''));
    if (!(n > 0) || readOnly) { setMsg(null); return; }
    const r = fitToNumber(boq, n, ctx);
    const margin = statsOf(r.lines.filter(l => tunable(l, bankMap))).margin;
    if (r.factor === 1 || r.lines.every((l, i) => l === boq[i])) { setMsg({ ok: true, t: `Already at ${inr(r.total)}.` }); return; }
    commit(r.lines, `Markups fitted to ${inr(n)}.`);
    if (r.met) setMsg({ ok: true, t: `Met: ${inr(r.total)}, ${margin.toFixed(1)}% margin${r.total < n ? `, ${inr(n - r.total)} under with the ₹100 rounding` : ''}. Undo puts the faders back.` });
    else if (r.gap > 0) setMsg({ ok: false, t: `The floors stop at ${inr(r.floorTotal)}: ${inr(r.gap)} above the client’s number. Take a line out or choose a lighter finish to close it.` });
    else setMsg({ ok: false, t: `Markups stop at their cap at ${inr(r.total)}: ${inr(-r.gap)} under the client’s number.` });
  };

  const meter = (m: number, master: boolean) => (
    <div className="flex flex-col gap-[3px]" aria-hidden>
      {Array.from({ length: 14 }, (_, j) => 13 - j).map(i => {
        const th = ((i + 0.5) * 35) / 14;
        const on = m >= th;
        return <span key={i} className={`block w-2.5 h-2 rounded-[2px] ${on ? (th < floor ? 'bg-rose-500' : th < floor + 5 ? 'bg-amber-400' : 'bg-emerald-500') : master ? 'bg-white/15' : 'bg-slate-200'}`} />;
      })}
    </div>
  );
  const fader = (g: Group, master = false) => {
    const st = statsOf(g.lines);
    const pos = Math.max(0, Math.min(1, st.markup / MAX)) * FH;
    return (
      <div key={g.id} className={`flex flex-col items-center gap-2 shrink-0 w-[78px] rounded-2xl px-1 py-3 hud-row-in ${master ? 'bg-slate-800 text-white' : ''}`}>
        <div className={`text-[10px] font-bold uppercase tracking-wider text-center leading-tight h-6 overflow-hidden ${master ? 'text-white/70' : 'text-slate-500'}`}>{g.name}</div>
        <div className="text-xs font-black tabular-nums">{lakh(st.sell).replace(' L', 'L')}</div>
        <div className="flex items-end gap-2">
          <div className={`relative w-2 rounded-full ${master ? 'bg-white/15' : 'bg-slate-200'}`} style={{ height: FH }}>
            <div className={`absolute left-0 right-0 bottom-0 rounded-full ${master ? 'bg-white/60' : 'bg-[#3D52A0]/40'}`} style={{ height: pos }} />
            <div className="absolute left-[-11px] right-[-11px] h-[2px] bg-amber-500/80" style={{ bottom: (Math.min(floorMk, MAX) / MAX) * FH }} title={`Floor: ${floor}% margin`} />
            <button type="button" disabled={readOnly} aria-label={`Markup for ${g.name}: ${st.markup.toFixed(1)}%`}
              onPointerDown={e => down(e, g)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e => key(e, g)}
              className="absolute left-1/2 -translate-x-1/2 w-9 h-5 rounded-md bg-white border border-slate-300 shadow-md touch-none cursor-ns-resize disabled:cursor-default"
              style={{ bottom: pos - 10 }} />
          </div>
          {meter(st.margin, master)}
        </div>
        <div className="text-sm font-black tabular-nums">{st.markup.toFixed(1)}%</div>
        <div className={`text-[10px] font-bold tabular-nums ${st.margin < floor ? 'text-rose-500' : st.margin < floor + 5 ? 'text-amber-500' : master ? 'text-emerald-300' : 'text-emerald-600'}`}>{st.margin.toFixed(1)}% margin</div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      <section className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-wrap gap-4 items-start">
        <div className="flex-1 basis-56">
          <div className={LABEL}>Client pays · work</div>
          <div className="text-2xl font-black tabular-nums">{inr(total)}</div>
          <div className="text-xs text-slate-500">{allStats.margin.toFixed(1)}% true margin · floor {floor}%</div>
        </div>
        <div className="flex-1 basis-64">
          <label htmlFor="tune-target" className={LABEL}>The client's number</label>
          <div className="mt-1 flex gap-2">
            <input id="tune-target" value={target} disabled={readOnly} inputMode="numeric"
              placeholder={Math.round(total * 0.95).toLocaleString('en-IN')}
              onChange={e => setTarget(e.target.value)} onBlur={fit} onKeyDown={e => { if (e.key === 'Enter') fit(); }}
              className={`${INPUT} tabular-nums !font-black`} />
          </div>
          {msg
            ? <p role="status" className={`text-xs mt-1 font-semibold ${msg.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{msg.t}</p>
            : <p className="text-[11px] text-slate-500 mt-1">The faders move to meet it, never under your floor.</p>}
        </div>
      </section>
      <section className="rounded-2xl bg-white border border-slate-200 p-3">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {groups.map(g => fader(g))}
          <div className="w-px bg-slate-200 mx-1 shrink-0" />
          {fader(all, true)}
        </div>
      </section>
    </div>
  );
}
