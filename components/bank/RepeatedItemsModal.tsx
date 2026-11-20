import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, X } from '@/lib/lucide-shim';
import { Item, FullProjectData } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Button, Chip, Segmented } from '../ui/kit';
import { CopyUse, RepeatedGroup, bankSell, bankUse, mergeCopies, originOf, repeatedGroups, separateCopy, settledGroups } from '../../lib/bankDuplicates';
import '../projectHeader/projectHeader.css';

interface Props {
  /** The whole bank, copies included. */
  bank: Item[];
  projects: FullProjectData[];
  setBank: React.Dispatch<React.SetStateAction<Item[]>>;
  onClose: () => void;
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
export default function RepeatedItemsModal({ bank, projects, setBank, onClose }: Props) {
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

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

  const apply = () => {
    if (!picked.length) return;
    const picks = picked.map((g) => ({ master: keptOf(g), copies: g.copies.map((c) => c.id) }));
    const hidden = picks.reduce((n, p) => n + p.copies.length - 1, 0);
    setBank((prev) => picks.reduce((b, p) => mergeCopies(b, p.master, p.copies), prev));
    setTicked(new Set());
    setNote(`${plural(picks.length, 'name')} settled: ${plural(hidden, 'copy', 'copies')} hidden. No rate and no project was changed.`);
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
                For each name held more than once, pick the one to keep as the item. The others stay in the bank, so older projects still find them, but are left out of this list, the pickers and imports. No rate and no project is changed.
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
                        onClick={() => setChoice((prev) => ({ ...prev, [g.key]: c.id }))}
                        className="w-full flex items-center gap-3 pl-10 pr-3 py-2 text-left hover:bg-slate-50 last:rounded-b-xl"
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
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 min-w-0">{note || (copies ? `${plural(copies, 'copy', 'copies')} hidden so far.` : 'Tick the names to settle. The kept item is marked on each.')}</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Close</Button>
            {tab === 'todo' && (
              <Button variant="primary" icon={Layers} onClick={apply} disabled={!picked.length}>
                Keep one item for {plural(picked.length, 'name')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
