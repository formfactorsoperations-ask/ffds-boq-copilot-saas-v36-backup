import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, X } from '@/lib/lucide-shim';
import { Item, FullProjectData } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Button, Chip, INPUT, LABEL, Segmented } from '../ui/kit';
import {
  CopyUse, RateEffect, RepeatedGroup, bankSell, bankUse, mergeCopies, originOf, previousRate, rateChoices, rateEffects, repeatedGroups, separateCopy, settledGroups,
  withPreviousRate, withStandardRate,
} from '../../lib/bankDuplicates';
import '../projectHeader/projectHeader.css';

interface Props {
  /** The whole bank, copies included. */
  bank: Item[];
  projects: FullProjectData[];
  setBank: React.Dispatch<React.SetStateAction<Item[]>>;
  /** The projects as stored now, to check a rate change against. Without it, the projects on screen are used. */
  read?: (stored?: boolean) => Promise<FullProjectData[]>;
  onClose: () => void;
}

interface Blocked { name: string; rate: number; effects: RateEffect[] }

const asRate = (text: string | undefined): number | null => {
  const n = Number(String(text ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The rate the kept item carries: what a new line starts from. Typed, or taken
 * from what the name has been at. It is only a choice here; the caller checks
 * it against every project before anything is saved.
 */
function RateRow({ kept, copies, lastRate, lastSold, value, onChange, children }: {
  kept: Item; copies: Item[]; lastRate: number | null; lastSold: boolean; value: string | undefined; onChange: (v: string) => void; children?: React.ReactNode;
}) {
  const own = Math.round(bankSell(kept));
  const want = asRate(value);
  const changed = want !== null && Math.round(want) !== own;
  return (
    <div className="flex flex-wrap items-center gap-2 pl-10 pr-3 py-2 border-t border-slate-100 bg-slate-50 last:rounded-b-xl">
      <span className={LABEL}>Standard rate</span>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        aria-label={`Standard rate for ${kept.name}`}
        value={value ?? String(own)}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} !w-28 !py-1 text-xs tabular-nums`}
      />
      {rateChoices(kept, copies, lastRate, lastSold).map((c) => (
        <Button key={c.rate} variant="quiet" size="sm" onClick={() => onChange(String(c.rate))} aria-label={`Use ${inr(c.rate)}, ${c.label}`}>
          {inr(c.rate)} <span className="font-normal">{c.label}</span>
        </Button>
      ))}
      <span className="text-[11px] text-slate-500 min-w-0">
        {changed ? `New lines will start at ${inr(want as number)}. Its margin stays ${Number(kept.margin) || 0}%.` : `New lines start at ${inr(own)}.`}
      </span>
      {children && <span className="ml-auto flex items-center gap-1">{children}</span>}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inr = (n: number) => formatCurrency(Math.round(n));
const usedIn = (u: CopyUse | undefined) => (u && u.projects ? `Used in ${plural(u.projects, 'project')}` : 'Not used in any project');

/**
 * Item Bank → Repeated items (lib/bankDuplicates.ts).
 *
 * Each name the bank holds more than once, with its copies: pick the one that
 * is the item, and the others are kept as its copies, out of sight. No rate, no
 * name and no project line is changed by it, and a copy can be made an item
 * again from the Settled list.
 */
export default function RepeatedItemsModal({ bank, projects, setBank, read, onClose }: Props) {
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  /* The rate typed for a name (To settle) or a kept item (Settled). Missing: the kept item's own. */
  const [rates, setRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<Blocked[]>([]);

  const use = useMemo(() => bankUse(bank, projects), [bank, projects]);
  const groups = useMemo(() => repeatedGroups(bank, use), [bank, use]);
  const settled = useMemo(() => settledGroups(bank), [bank]);
  const copies = settled.reduce((n, g) => n + g.copies.length, 0);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const keptOf = (g: RepeatedGroup) => (g.copies.some((c) => c.id === choice[g.key]) ? choice[g.key] : g.suggested.id);
  const picked = groups.filter((g) => ticked.has(g.key));
  const flip = (key: string) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  /* The projects to check a rate against: as stored now when they can be read, else the ones on screen. */
  const projectsNow = async (): Promise<FullProjectData[]> => {
    if (!read) return projects;
    try { return await read(); } catch { return projects; }
  };

  /**
   * Which of the asked rate changes are safe: no option of any project prices
   * differently with the item at its new rate. The rest are refused, with the
   * options that still follow the bank.
   */
  const sortRates = (asks: Array<{ item: Item; next: Item }>, now: FullProjectData[]) => {
    const safe = new Map<string, Item>();
    const refused: Blocked[] = [];
    asks.forEach(({ item, next }) => {
      if (next === item) return;
      const effects = rateEffects(bank, next, now);
      if (effects.length) refused.push({ name: String(item.name), rate: bankSell(next), effects });
      else safe.set(item.id, next);
    });
    return { safe, refused };
  };

  const apply = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      const picks = picked.map((g) => {
        const master = g.copies.find((c) => c.id === keptOf(g)) as Item;
        const want = asRate(rates[g.key]);
        return { master, copies: g.copies.map((c) => c.id), next: want !== null ? withStandardRate(master, want) : master };
      });
      const { safe, refused } = sortRates(picks.map((p) => ({ item: p.master, next: p.next })), await projectsNow());
      const hidden = picks.reduce((n, p) => n + p.copies.length - 1, 0);
      setBank((prev) => picks.reduce((b, p) => mergeCopies(b, p.master.id, p.copies), prev).map((i) => {
        const next = safe.get(i.id);
        // Only the three figures and the history: the copy marks made just above stay.
        return next ? { ...i, materials: next.materials, labor: next.labor, margin: next.margin, rateHistory: next.rateHistory } : i;
      }));
      setTicked(new Set());
      setBlocked(refused);
      setNote(`${plural(picks.length, 'name')} settled: ${plural(hidden, 'copy', 'copies')} hidden${safe.size ? `, ${plural(safe.size, 'standard rate')} set` : ''}. No project was changed.`);
    } finally {
      setBusy(false);
    }
  };

  /** Set one kept item's rate, or put its last one back, once no project would be re-priced by it. */
  const changeRate = async (item: Item, next: Item, done: string) => {
    if (next === item || busy) return;
    setBusy(true);
    try {
      const { safe, refused } = sortRates([{ item, next }], await projectsNow());
      setBlocked(refused);
      if (!safe.size) { setNote(`${item.name}: the rate was not changed.`); return; }
      setBank((prev) => prev.map((i) => (i.id === item.id ? { ...i, materials: next.materials, labor: next.labor, margin: next.margin, rateHistory: next.rateHistory } : i)));
      setRates((prev) => { const { [`m:${item.id}`]: _gone, ...rest } = prev; return rest; });
      setNote(done);
    } finally {
      setBusy(false);
    }
  };

  const separate = (c: Item) => {
    setBank((prev) => separateCopy(prev, c.id));
    setNote(`${c.name} at ${inr(bankSell(c))} is an item again.`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Repeated items">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="p-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Item Bank</p>
              <h3 className="font-bold text-slate-800 mt-1">Repeated items</h3>
              <p className="text-xs text-slate-500 mt-1">
                For each name held more than once, pick the one to keep as the item and the rate a new line starts from. The others stay in the bank, so older projects still find them, but are left out of this list, the pickers and imports. A rate is only changed when no project would be re-priced by it.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              label="Which names to show"
              value={tab}
              onChange={setTab}
              options={[{ id: 'todo', label: 'To settle', count: groups.length }, { id: 'done', label: 'Settled', count: settled.length }]}
            />
            {tab === 'todo' && groups.length > 0 && (
              <Button variant="quiet" size="sm" className="ml-auto" onClick={() => setTicked(picked.length === groups.length ? new Set() : new Set(groups.map((g) => g.key)))}>
                {picked.length === groups.length ? 'Clear ticks' : `Tick all ${groups.length}`}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 min-h-[14rem]">
          {blocked.length > 0 && (
            <div className="mb-3 rounded-xl border border-slate-200 divide-y divide-slate-100" role="status">
              <div className="flex items-start gap-3 p-2.5">
                <span className="flex-1 min-w-0 text-xs text-slate-700">
                  <b className="font-semibold text-slate-800">{plural(blocked.length, 'rate')} not changed.</b> Some lines still take their price from the Item Bank and would be re-priced. Lock prices on those projects (Item Bank → Lock prices), then set the rate again.
                </span>
                <Chip tone="warn">Left as it is</Chip>
              </div>
              {blocked.map((b) => (
                <div key={b.name} className="p-2.5 text-xs text-slate-500">
                  <span className="block font-semibold text-slate-800">{b.name} to {inr(b.rate)}</span>
                  {b.effects.slice(0, 3).map((e, n) => (
                    <span key={n} className="block truncate tabular-nums">{e.project} · {e.option}: {inr(e.before)} would become {inr(e.after)}</span>
                  ))}
                  {b.effects.length > 3 && <span className="block">and {plural(b.effects.length - 3, 'more option')}</span>}
                </div>
              ))}
            </div>
          )}

          {tab === 'todo' && groups.length === 0 && <p className="text-xs text-slate-500 p-6 text-center">No name is held more than once.</p>}

          {tab === 'todo' && groups.map((g, i) => {
            const on = ticked.has(g.key);
            const kept = keptOf(g);
            return (
              <div key={g.key} className="hud-row-in mb-2 rounded-xl border border-slate-200" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <button type="button" onClick={() => flip(g.key)} aria-pressed={on} className="w-full flex items-center gap-3 p-2.5 text-left rounded-t-xl hover:bg-slate-50">
                  <span className={`w-5 h-5 rounded-md grid place-items-center border-2 shrink-0 transition-colors ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'border-slate-300 text-transparent'}`}>
                    <Check className="w-3 h-3" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{g.name}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {plural(g.copies.length, 'copy', 'copies')} · {Math.round(g.low) === Math.round(g.high) ? `all at ${inr(g.low)}` : `${inr(g.low)} to ${inr(g.high)}`}
                      {g.lastRate !== null && ` · last ${g.lastSold ? 'sold' : 'quoted'} at ${inr(g.lastRate)} in ${g.lastProject}`}
                    </span>
                  </span>
                </button>
                <div role="radiogroup" aria-label={`The item to keep for ${g.name}`} className="divide-y divide-slate-100 border-t border-slate-100">
                  {g.copies.map((c) => {
                    const sel = kept === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        aria-label={`Keep the one at ${inr(bankSell(c))}, ${originOf(c)}`}
                        onClick={() => { setChoice((prev) => ({ ...prev, [g.key]: c.id })); setRates((prev) => { const { [g.key]: _gone, ...rest } = prev; return rest; }); }}
                        className="w-full flex items-center gap-3 pl-10 pr-3 py-2 text-left hover:bg-slate-50"
                      >
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 grid place-items-center ${sel ? 'border-[#3D52A0]' : 'border-slate-300'}`}>
                          {sel && <span className="w-2 h-2 rounded-full bg-[#3D52A0]" />}
                        </span>
                        <span className="w-40 shrink-0 text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">{inr(bankSell(c))}<span className="font-normal text-slate-500"> / {c.unit}</span></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs text-slate-700 truncate">{originOf(c)} · {usedIn(use.get(c.id))}</span>
                          <span className="block text-[11px] text-slate-500 truncate">{String(c.specs || '').trim() || 'No specification written'}</span>
                        </span>
                        {sel ? <Chip tone="brand">Kept</Chip> : <Chip>Hidden</Chip>}
                      </button>
                    );
                  })}
                </div>
                <RateRow
                  kept={g.copies.find((c) => c.id === kept) as Item}
                  copies={g.copies}
                  lastRate={g.lastRate}
                  lastSold={g.lastSold}
                  value={rates[g.key]}
                  onChange={(v) => setRates((prev) => ({ ...prev, [g.key]: v }))}
                />
              </div>
            );
          })}

          {tab === 'done' && settled.length === 0 && <p className="text-xs text-slate-500 p-6 text-center">Nothing has been settled yet.</p>}

          {tab === 'done' && settled.map((g) => (
            <div key={g.master?.id || g.copies[0].id} className="mb-2 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3 p-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{g.master?.name || g.copies[0].name}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {g.master ? `${inr(bankSell(g.master))} / ${g.master.unit} · ${originOf(g.master)} · ${usedIn(use.get(g.master.id))}` : 'The item these were copies of is no longer in the bank.'}
                  </span>
                </span>
                {g.master && <Chip tone="brand">Kept</Chip>}
              </div>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {g.copies.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 pl-10 pr-3 py-2">
                    <span className="w-40 shrink-0 text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">{inr(bankSell(c))}<span className="font-normal text-slate-500"> / {c.unit}</span></span>
                    <span className="flex-1 min-w-0 text-xs text-slate-700 truncate">{originOf(c)} · {usedIn(use.get(c.id))}</span>
                    <Button variant="quiet" size="sm" onClick={() => separate(c)} aria-label={`Make the one at ${inr(bankSell(c))} an item again`}>Make it an item again</Button>
                  </div>
                ))}
              </div>
              {g.master && (() => {
                const m = g.master as Item;
                const last = [m, ...g.copies].map((c) => use.get(c.id)).filter((u): u is CopyUse => !!u && u.lastAt !== null)
                  .sort((a, b) => Number(b.lastSold) - Number(a.lastSold) || (b.lastAt as number) - (a.lastAt as number))[0];
                const want = asRate(rates[`m:${m.id}`]);
                const was = previousRate(m);
                return (
                  <RateRow kept={m} copies={g.copies} lastRate={last?.lastRate ?? null} lastSold={!!last?.lastSold} value={rates[`m:${m.id}`]} onChange={(v) => setRates((prev) => ({ ...prev, [`m:${m.id}`]: v }))}>
                    {was !== null && (
                      <Button variant="quiet" size="sm" disabled={busy} onClick={() => changeRate(m, withPreviousRate(m), `${m.name} is back at ${inr(was)}.`)}>Put {inr(was)} back</Button>
                    )}
                    <Button
                      size="sm"
                      disabled={busy || want === null || Math.round(want) === Math.round(bankSell(m))}
                      onClick={() => want !== null && changeRate(m, withStandardRate(m, want), `${m.name} now starts at ${inr(want)}. No project was changed.`)}
                      aria-label={`Set the rate for ${m.name}`}
                    >
                      Set rate
                    </Button>
                  </RateRow>
                );
              })()}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 min-w-0">{note || (copies ? `${plural(copies, 'copy', 'copies')} hidden so far.` : 'Tick the names to settle. The kept item is marked on each.')}</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Close</Button>
            {tab === 'todo' && (
              <Button variant="primary" icon={Layers} onClick={apply} disabled={!picked.length || busy}>
                {busy ? 'Checking the projects…' : `Keep one item for ${plural(picked.length, 'name')}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
