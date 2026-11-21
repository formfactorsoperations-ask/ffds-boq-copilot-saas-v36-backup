import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button, StateDot, INPUT, LABEL } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import { IconTile, listV, rowV, EASE, type RingTone } from '../people/PeopleBits';
import '../projectHeader/projectHeader.css';
import {
  Search, X, Plus, Upload, Download, FileText, Briefcase, Lock, Layers, Sparkles, Table, Grid,
  PackageCheck, Percent, Building2, AlertTriangle, ChevronDown, FileSpreadsheet, FileJson, Boxes,
} from '@/lib/lucide-shim';

/*
  The top of the Item bank (DESIGN.md "Item bank motion").

  It used to be one card holding four status pills, nine buttons in a row that
  ran off the side of the screen, five figures, a view switch and a filter row
  that scrolled out of sight, with search and categories in a second card.
  Now it reads top to bottom: the figures (the ones that filter are buttons),
  then one card with the view switch and the actions, search, and the filters,
  all of them on the page with nothing to scroll sideways for.

  Everything here is told what to show and says what was picked; the bank, the
  filtering and the saving stay in BankTab.
*/

export type BankView = 'spreadsheet' | 'grouped' | 'grid' | 'bundles';
export type BankHealth = 'all' | 'low-margin' | 'missing-specs' | 'multiplier' | 'in-active-projects' | 'no-recipe' | 'no-size';

type DotTone = 'slate' | 'good' | 'warn' | 'bad';

export interface BankCommandBarProps {
  stats: {
    totalItems: number;
    totalCategories: number;
    avgMargin: number;
    lowMarginCount: number;
    itemsInProjectsCount: number;
    missingSpecsCount: number;
    multiplierCount: number;
  };
  /** Items with no recipe; null where the studio has no Material specs bank. */
  noRecipeCount: number | null;
  /** Items that are made and measured, with no standard size yet (lib/playground/pieces canHaveSize). */
  noSizeCount?: number;
  copyCount: number;
  showCopies: boolean;
  onToggleCopies: () => void;

  view: BankView;
  onView: (v: BankView) => void;
  bundleCount: number;

  health: BankHealth;
  onHealth: (h: BankHealth) => void;
  search: string;
  onSearch: (s: string) => void;
  categories: Array<{ name: string; count: number }>;
  category: string;
  onCategory: (c: string) => void;
  projects: Array<{ id: string; label: string }>;
  projectId: string;
  onProject: (id: string) => void;
  /** How many items pass the search and filters. */
  matching: number;
  filtersOn: boolean;
  onClearFilters: () => void;

  onImportSheet: () => void;
  onImportSpecs: () => void;
  onImportJson: () => void;
  onExportJson: () => void;
  onExportUsage: () => void;
  usageTitle: string;
  /** Lock prices and Repeated items are the owner's; without a handler the button is not drawn. */
  onLockPrices?: () => void;
  onRepeated?: () => void;
  repeatedCount: number;
  onAiKits: () => void;
  aiBusy: boolean;
  onAdd: () => void;
}

/* ── A figure ───────────────────────────────────────────────────────────── */

/** One figure above the work: an icon tile, a label, a number that counts up and a line. Material specs uses it too. */
export const Tile: React.FC<{
  icon: React.ComponentType<any>;
  tone?: RingTone;
  label: string;
  value: number;
  format?: (v: number) => string;
  sub: React.ReactNode;
  dot?: DotTone;
  /** Given, the tile is a button that turns its filter on and off. */
  onClick?: () => void;
  on?: boolean;
  title?: string;
  /** The fifth of five: takes the whole row where the tiles sit two across. */
  wide?: boolean;
}> = ({ icon, tone = 'brand', label, value, format, sub, dot, onClick, on, title, wide }) => {
  const body = (
    <>
      {/* On a phone the tiles sit two across; the words need the room more than the icon does. */}
      <span className="hidden sm:block shrink-0"><IconTile icon={icon} tone={tone} /></span>
      <span className="min-w-0 block">
        <span className={`flex items-center gap-1.5 ${LABEL}`}>{dot && <StateDot tone={dot} />}{label}</span>
        <span className="mt-0.5 block text-xl font-black text-slate-800 tabular-nums leading-tight"><CountUp value={value} format={format} /></span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">{sub}</span>
      </span>
    </>
  );
  const box = 'group h-full w-full min-w-0 flex items-start gap-3 text-left bg-white rounded-xl border px-4 py-3';
  return (
    <motion.div variants={rowV} className={`min-w-0 ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={!!on} title={title}
          className={`${box} pp-lift transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${on ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/15' : 'border-slate-200 hover:border-[#3D52A0]/40'}`}>
          {body}
        </button>
      ) : (
        <div className={`${box} border-slate-200`}>{body}</div>
      )}
    </motion.div>
  );
};

/* ── A filter pill, whose brand fill glides to the one picked ───────────── */

const Pill: React.FC<{
  on: boolean;
  onClick: () => void;
  group: string;
  count?: number;
  dot?: DotTone;
  children: React.ReactNode;
}> = ({ on, onClick, group, count, dot, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`relative inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${on ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
    {on && <motion.span layoutId={`bank-pill-${group}`} className="absolute inset-0 rounded-full bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
    <span className="relative inline-flex items-center gap-1.5">
      {dot && !on && <StateDot tone={dot} />}
      {children}
      {count != null && <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>}
    </span>
  </button>
);

/* ── Import and Export: a button that opens a short list ────────────────── */

interface MenuItem { label: string; hint: string; icon: React.ComponentType<any>; onClick: () => void; title?: string }

const Menu: React.FC<{ label: string; icon: React.ElementType; items: MenuItem[] }> = ({ label, icon, items }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Button size="sm" icon={icon} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </Button>
      {open && (
        <div role="menu" aria-label={label} className="phd-pop absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg p-1.5">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" aria-label={it.label} title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
              className="group w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50">
              <it.icon className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 transition-colors group-hover:text-[#3D52A0]" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-700">{it.label}</span>
                <span className="block text-[11px] text-slate-500">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── The bar ────────────────────────────────────────────────────────────── */

const VIEWS: Array<{ id: BankView; label: string; icon: React.ComponentType<any> }> = [
  { id: 'spreadsheet', label: 'Spreadsheet', icon: Table },
  { id: 'grouped', label: 'By category', icon: Layers },
  { id: 'grid', label: 'Cards', icon: Grid },
  { id: 'bundles', label: 'Room kits', icon: PackageCheck },
];

const typingElsewhere = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

const BankCommandBar: React.FC<BankCommandBarProps> = (p) => {
  const { stats } = p;
  const searchRef = useRef<HTMLInputElement>(null);
  const still = useReducedMotion();

  /* "/" puts the cursor in search, as it does in most tools people already use. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || typingElsewhere(e.target)) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  /* A figure that filters turns its filter on, and off again when it is already on. */
  const toggle = (h: BankHealth) => () => { p.onHealth(p.health === h ? 'all' : h); if (p.view === 'bundles') p.onView('spreadsheet'); };
  const words = p.noRecipeCount != null
    ? { h: 'no-recipe' as BankHealth, label: 'No recipe yet', n: p.noRecipeCount, sub: 'Not built from materials yet' }
    : { h: 'missing-specs' as BankHealth, label: 'Missing specs', n: stats.missingSpecsCount, sub: 'No specification written' };

  return (
    <div className="space-y-4">
      {/* The figures. The ones that filter are buttons. */}
      <motion.div variants={listV} initial="hidden" animate="show" className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Tile icon={Boxes} label="Items" value={stats.totalItems}
          sub={<>
            <span>{stats.totalCategories} {stats.totalCategories === 1 ? 'category' : 'categories'}</span>
            {p.copyCount > 0 && (
              <button type="button" onClick={p.onToggleCopies} aria-pressed={p.showCopies}
                title="Copies of an item the bank already has. They are kept so older projects still find them, and are left out of this list, the pickers and imports."
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${p.showCopies ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {p.copyCount} {p.copyCount === 1 ? 'copy' : 'copies'} {p.showCopies ? 'shown' : 'hidden'}
              </button>
            )}
          </>} />
        <Tile icon={Percent} tone={stats.totalItems > 0 && stats.avgMargin < 15 ? 'warn' : 'brand'} label="Average margin"
          value={stats.avgMargin} format={(v) => `${v.toFixed(1)}%`} sub="Markup over cost" />
        <Tile icon={Building2} label="In project BOQs" value={stats.itemsInProjectsCount} sub="Used by at least one project"
          onClick={toggle('in-active-projects')} on={p.health === 'in-active-projects'} title="Show only the items a project uses" />
        <Tile icon={AlertTriangle} tone={stats.lowMarginCount > 0 ? 'bad' : 'ok'} dot={stats.lowMarginCount > 0 ? 'bad' : 'good'}
          label="Low margin" value={stats.lowMarginCount} sub="Priced under 15%"
          onClick={toggle('low-margin')} on={p.health === 'low-margin'} title="Show only the items priced under 15% margin" />
        <Tile icon={FileText} tone={words.n > 0 ? 'warn' : 'ok'} dot={words.n > 0 ? 'warn' : 'good'}
          label={words.label} value={words.n} sub={words.sub} wide
          onClick={toggle(words.h)} on={p.health === words.h} title={`Show only these ${words.n} items`} />
      </motion.div>

      <section className="relative z-20 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in" style={{ animationDelay: '60ms' }}>
        {/* How to look at the bank, and what can be done to it. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="View" className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
            {VIEWS.map((v) => {
              const on = p.view === v.id;
              return (
                <button key={v.id} type="button" role="radio" aria-checked={on} onClick={() => p.onView(v.id)}
                  className={`group relative px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${on ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                  {on && <motion.span layoutId="bank-view" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="relative inline-flex items-center gap-2">
                    <v.icon className={`w-4 h-4 transition-transform duration-300 ${on ? 'text-[#3D52A0] scale-110' : 'text-slate-400 group-hover:-rotate-12'}`} aria-hidden />
                    {v.label}
                    {v.id === 'bundles' && p.bundleCount > 0 && (
                      <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-[#3D52A0]' : 'text-slate-400'}`}>{p.bundleCount}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Menu label="Import" icon={Upload} items={[
              { label: 'Import Excel/CSV', hint: 'Add items from a sheet. One the bank already has goes in as its copy.', icon: FileSpreadsheet, onClick: p.onImportSheet },
              { label: 'Specs from Excel', hint: 'Download the spec sheet, fill it in Excel and import it back.', icon: FileText, onClick: p.onImportSpecs },
              { label: 'JSON upload', hint: 'Bring in a bank exported from StudioDesk.', icon: FileJson, onClick: p.onImportJson },
            ]} />
            <Menu label="Export" icon={Download} items={[
              { label: 'Export JSON', hint: 'The whole bank as one file, to keep or move.', icon: FileJson, onClick: p.onExportJson },
              { label: 'Export usage', hint: 'Which project lines use each item, and at what price.', icon: Briefcase, onClick: p.onExportUsage, title: p.usageTitle },
            ]} />
            {p.onLockPrices && (
              <Button size="sm" icon={Lock} onClick={p.onLockPrices}
                title="Make projects keep the prices they use today, so a change in the Item Bank no longer re-prices them. Shows every total before anything is saved.">
                Lock prices
              </Button>
            )}
            {p.onRepeated && (
              <Button size="sm" icon={Layers} onClick={p.onRepeated}
                title="Names the bank holds more than once. Pick the one item to keep for each; the others are kept, hidden. No rate and no project is changed.">
                Repeated items{p.repeatedCount > 0 ? ` (${p.repeatedCount})` : ''}
              </Button>
            )}
            <Button size="sm" onClick={p.onAiKits} disabled={p.aiBusy} title="Put together room kits from the bank">
              <Sparkles className={`w-3.5 h-3.5 text-[#3D52A0] ${p.aiBusy ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
              AI room kits
            </Button>
            <Button size="sm" variant="primary" onClick={p.onAdd} className="group motion-safe:active:scale-[0.97]">
              <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" aria-hidden />
              Add item
            </Button>
          </div>
        </div>

        {/* Search and filters belong to the item views; the room kits have none, so they fold away. */}
        <AnimatePresence initial={false}>
          {p.view !== 'bundles' && (
            <motion.div key="filters" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: still ? 0 : 0.28, ease: EASE }} className="overflow-hidden -mx-1 px-1">
              <div className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative grow basis-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                    <input ref={searchRef} type="text" value={p.search} onChange={(e) => p.onSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape' && p.search) { e.stopPropagation(); p.onSearch(''); } }}
                      aria-label="Search the item bank" placeholder="Search by name, specs, execution notes or category"
                      className={`${INPUT} !rounded-xl pl-9 pr-10`} />
                    {p.search ? (
                      <button type="button" onClick={() => { p.onSearch(''); searchRef.current?.focus(); }} aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <kbd aria-hidden className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 rounded border border-slate-200 text-[10px] font-bold text-slate-400 pointer-events-none">/</kbd>
                    )}
                  </div>
                  <p role="status" className="order-last sm:order-none text-xs text-slate-500 whitespace-nowrap">
                    <span className="font-bold text-slate-800 tabular-nums">{p.matching}</span>
                    {p.filtersOn ? ` of ${stats.totalItems} items` : ` ${stats.totalItems === 1 ? 'item' : 'items'}`}
                  </p>
                  {p.filtersOn && <Button size="sm" variant="quiet" icon={X} onClick={p.onClearFilters} className="hud-row-in">Clear filters</Button>}
                  {p.projects.length > 0 && (
                    <select value={p.projectId} onChange={(e) => p.onProject(e.target.value)} aria-label="Show the items one project uses"
                      className={`${INPUT} !w-auto !rounded-xl max-w-full sm:max-w-xs bg-white cursor-pointer`}>
                      <option value="All">All projects</option>
                      {p.projects.map((proj) => <option key={proj.id} value={proj.id}>{proj.label}</option>)}
                    </select>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
                  <span className={`${LABEL} w-16 shrink-0`}>Show</span>
                  <Pill group="health" on={p.health === 'all'} onClick={() => p.onHealth('all')} count={stats.totalItems}>All</Pill>
                  <Pill group="health" on={p.health === 'in-active-projects'} onClick={() => p.onHealth('in-active-projects')} count={stats.itemsInProjectsCount}>In projects</Pill>
                  <Pill group="health" on={p.health === 'low-margin'} onClick={() => p.onHealth('low-margin')} count={stats.lowMarginCount} dot={stats.lowMarginCount > 0 ? 'bad' : undefined}>Low margin</Pill>
                  <Pill group="health" on={p.health === 'missing-specs'} onClick={() => p.onHealth('missing-specs')} count={stats.missingSpecsCount} dot={stats.missingSpecsCount > 0 ? 'warn' : undefined}>Missing specs</Pill>
                  {p.noRecipeCount != null && (
                    <Pill group="health" on={p.health === 'no-recipe'} onClick={() => p.onHealth('no-recipe')} count={p.noRecipeCount} dot={p.noRecipeCount > 0 ? 'warn' : undefined}>No recipe yet</Pill>
                  )}
                  {p.noSizeCount != null && (
                    <Pill group="health" on={p.health === 'no-size'} onClick={() => p.onHealth('no-size')} count={p.noSizeCount} dot={p.noSizeCount > 0 ? 'warn' : undefined}>No standard size</Pill>
                  )}
                  <Pill group="health" on={p.health === 'multiplier'} onClick={() => p.onHealth('multiplier')} count={stats.multiplierCount}>Custom area factor</Pill>
                </div>

                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Category">
                  <span className={`${LABEL} w-16 shrink-0`}>Category</span>
                  {p.categories.map((c) => (
                    <Pill key={c.name} group="cat" on={p.category === c.name} onClick={() => p.onCategory(c.name)} count={c.count}>{c.name}</Pill>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default BankCommandBar;
