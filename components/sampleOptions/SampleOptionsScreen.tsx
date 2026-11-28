import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Sprout, Gem, Crown, Presentation, X, ChevronDown, Check, Minus, LayoutGrid, Plus } from 'lucide-react';
import type { Item } from '../../types';
import type { TemplateData } from '../../lib/standardPackages';
import {
  sampleOptions, sampleSizesOf, defaultSampleSize, typicalCarpetOf, usualAreasOf, inLakhs,
  type SampleBook, type SampleOption,
} from '../../lib/sampleOptions';
import { Panel, Button, Segmented, EmptyState, IconChip, LABEL, INPUT } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import { useOrg } from '../../contexts/OrgContext';

/*
  Sample options (asked for 28 Nov 2026): the three options for a typical home,
  to show a client at the first meeting, before there is a project or a BOQ.

  Priced by the generator a new project uses (lib/sampleOptions), from the
  studio's Standard templates, Item bank and Option setup, so the figures move
  when the studio's rates do. Nothing is saved. A client may be watching, so
  there is never a cost or a margin here: ranges, room amounts, and what each
  option includes. "Present to client" shows the same thing full screen,
  without the app around it.
*/

const MEDAL = [Sprout, Gem, Crown];

interface Props {
  bank: Item[];
  templates: TemplateData;
}

/** The size and area the sample is for, shared by the page and the presenting view. */
function useSample(templates: TemplateData) {
  const sizes = useMemo(() => sampleSizesOf(templates), [templates]);
  const [size, setSize] = useState<string | null>(() => defaultSampleSize(sizes));
  const [carpet, setCarpet] = useState(() => typicalCarpetOf(size || '2-BHK'));
  useEffect(() => {
    if (!size || !sizes.includes(size)) {
      const next = defaultSampleSize(sizes);
      setSize(next);
      if (next) setCarpet(typicalCarpetOf(next));
    }
  }, [sizes, size]);
  const pickSize = (s: string) => { setSize(s); setCarpet(typicalCarpetOf(s)); };
  return { sizes, size, carpet, setCarpet, pickSize };
}

/** The size switch and the carpet area, with three usual areas to pick from. */
function HomeControls({ sizes, size, carpet, setCarpet, pickSize, compact }: ReturnType<typeof useSample> & { compact?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!size) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <div>
        <span className={`${LABEL} block mb-1.5`}>Home</span>
        <Segmented size={compact ? 'sm' : 'md'} label="Size of the home" value={size} onChange={pickSize}
          options={sizes.map(s => ({ id: s, label: s }))} />
      </div>
      <label className="block">
        <span className={`${LABEL} block mb-1.5`}>Carpet area, sq ft</span>
        <input type="number" min={200} inputMode="numeric" value={draft ?? String(carpet)}
          onFocus={(e) => { setDraft(String(carpet)); e.currentTarget.select(); }}
          onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (n >= 200) setCarpet(Math.round(n)); }}
          onBlur={() => setDraft(null)}
          className={`${INPUT} !w-28 !py-1.5 font-bold tabular-nums`} />
      </label>
      <div role="group" aria-label="Usual carpet areas" className="flex flex-wrap gap-1.5">
        {usualAreasOf(size).map(a => (
          <button key={a} type="button" aria-pressed={carpet === a} onClick={() => { setDraft(null); setCarpet(a); }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold tabular-nums transition-colors motion-safe:active:scale-[0.97] ${carpet === a ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}>
            {a.toLocaleString('en-IN')}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One option: its range, what it costs a square foot, its finish and what it adds. */
const OptionCard: React.FC<{ option: SampleOption; index: number; previous?: SampleOption }> = ({ option, index, previous }) => {
  const featured = index === 1;
  return (
    <article aria-label={option.name}
      className={`relative bg-white rounded-2xl border shadow-sm p-6 hud-panel-in ${featured ? 'border-[#3D52A0] ring-4 ring-[#3D52A0]/10' : 'border-slate-200'}`}
      style={{ animationDelay: `${index * 70}ms` }}>
      {featured && <span className="absolute inset-x-6 top-0 h-1 rounded-b-full bg-[#3D52A0]" aria-hidden />}
      <div className="flex items-start gap-3">
        <IconChip icon={MEDAL[index] || Gem} />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-800">{option.name}</h3>
          {option.finish && <p className="text-xs text-slate-500 mt-0.5">{option.finish}</p>}
        </div>
      </div>
      <div className="mt-5">
        <span className={`${LABEL} block`}>Typical range</span>
        <span className="block text-2xl font-black text-slate-800 tabular-nums leading-tight mt-1">
          <CountUp value={option.low} format={v => inLakhs(Math.round(v / 10000) * 10000)} />
          <span className="text-slate-400 font-bold"> – </span>
          <CountUp value={option.high} format={v => inLakhs(Math.round(v / 10000) * 10000)} />
        </span>
        <span className="block text-[11px] text-slate-500 tabular-nums mt-1">About ₹{option.perSqft.toLocaleString('en-IN')} per sq ft</span>
      </div>
      <div className="mt-5 pt-4 border-t border-slate-100">
        <span className={`${LABEL} block mb-2`}>{previous ? `Adds to ${previous.name}` : 'The essentials'}</span>
        {previous ? (
          <ul className="space-y-1.5">
            {[...(option.finish && option.finish !== previous.finish ? [`A better finish: ${option.finish}`] : []), ...option.adds].map(a => (
              <li key={a} className="flex items-start gap-2 text-xs text-slate-700">
                <Plus className="w-3.5 h-3.5 mt-px text-[#3D52A0] shrink-0" aria-hidden />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Everything listed room by room below, in the standard finish.</p>
        )}
      </div>
    </article>
  );
};

/** Room by room: each option's amount, and a room opens to what each option includes there. */
function RoomTable({ book }: { book: SampleBook }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const grades = book.options.map(o => o.grade);
  const totals = book.options.map(o => o.mid);
  return (
    <Panel flush icon={LayoutGrid} title="Room by room"
      blurb={`Each option for a ${book.size} of ${book.carpet.toLocaleString('en-IN')} sq ft. Open a room to see what each option includes.`}
      foot="An indication from the studio's standard rates, before design and site measurement. Amounts rounded; GST extra.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50">
              <th scope="col" className={`${LABEL} text-left px-6 py-2.5`}>Room</th>
              {book.options.map(o => <th key={o.grade} scope="col" className={`${LABEL} text-right px-4 py-2.5`}>{o.name}</th>)}
            </tr>
          </thead>
          {book.rooms.map((r, i) => {
            const isOpen = open.has(r.id);
            return (
              <tbody key={r.id} className="border-b border-slate-100 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                <tr className="hover:bg-slate-50 transition-colors">
                  <th scope="row" className="text-left px-6 py-3 font-normal">
                    <button type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen} className="flex items-start gap-2 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30">
                      <ChevronDown className={`w-4 h-4 mt-0.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800">{r.label}</span>
                        <span className="block text-[11px] text-slate-500">{r.area ? `${r.area.toLocaleString('en-IN')} sq ft` : r.detail}</span>
                      </span>
                    </button>
                  </th>
                  {grades.map(g => (
                    <td key={g} className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">
                      {r.amounts[g] ? inLakhs(r.amounts[g]!) : <span className="text-slate-400 font-semibold">Not included</span>}
                    </td>
                  ))}
                </tr>
                {isOpen && r.lines.map(l => (
                  <tr key={l.name} className="bg-slate-50/60">
                    <td className="pl-12 pr-6 py-2 text-xs text-slate-700">{l.name}</td>
                    {grades.map(g => (
                      <td key={g} className="px-4 py-2 text-right">
                        {l.in.includes(g)
                          ? <Check className="inline w-4 h-4 text-[#3D52A0]" aria-label="Included" />
                          : <Minus className="inline w-4 h-4 text-slate-300" aria-label="Not included" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            );
          })}
          <tfoot>
            <tr className="bg-slate-50">
              <th scope="row" className="text-left px-6 py-3 text-sm font-bold text-slate-800">The whole home</th>
              {totals.map((t, i) => <td key={i} className="px-4 py-3 text-right font-black text-slate-800 tabular-nums whitespace-nowrap">{inLakhs(t)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

/** The options and the rooms: what the client sees, on the page and full screen. */
function SampleBody({ book }: { book: SampleBook }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {book.options.map((o, i) => <OptionCard key={o.grade} option={o} index={i} previous={book.options[i - 1]} />)}
      </div>
      <RoomTable book={book} />
    </div>
  );
}

const titleOf = (book: SampleBook) => `Three ways to do a ${book.size} of about ${book.carpet.toLocaleString('en-IN')} sq ft`;
const bandLine = (book: SampleBook) => `Ranges cover homes of ${book.band[0].toLocaleString('en-IN')}–${book.band[1].toLocaleString('en-IN')} sq ft carpet.`;

/** Full screen, without the app around it, for the meeting room's screen. */
function Presenting({ book, sample, studio, onClose }: { book: SampleBook; sample: ReturnType<typeof useSample>; studio?: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const html = document.documentElement;
    let entered = false;
    try { if (html.requestFullscreen && !document.fullscreenElement) { html.requestFullscreen().then(() => { entered = true; }).catch(() => {}); } } catch { /* stays in the window */ }
    /* Esc in full screen is the browser's: leaving full screen closes the view too. */
    const left = () => { if (entered && !document.fullscreenElement) onClose(); };
    document.addEventListener('fullscreenchange', left);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', left);
      try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch { /* nothing to leave */ }
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Sample options" className="fixed inset-0 z-[300] bg-[#F4F7FB] overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6 hud-swap">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className={LABEL}>{studio ? `${studio} · Sample options` : 'Sample options'}</span>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight mt-1">{titleOf(book)}</h2>
            <p className="text-xs text-slate-500 mt-1">{bandLine(book)} Your own quote follows once we have measured and designed your home.</p>
          </div>
          <Button icon={X} onClick={onClose}>Close</Button>
        </header>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4">
          <HomeControls {...sample} compact />
        </div>
        <SampleBody book={book} />
      </div>
    </div>,
    document.body,
  );
}

export default function SampleOptionsScreen({ bank, templates }: Props) {
  const sample = useSample(templates);
  const { size, carpet } = sample;
  const { orgData } = useOrg();
  const [presenting, setPresenting] = useState(false);
  /* Stable, so the presenting view does not leave and re-enter full screen each time the sample changes. */
  const stopPresenting = useCallback(() => setPresenting(false), []);

  const book = useMemo(() => {
    if (!size || !bank.length) return null;
    try { return sampleOptions({ size, carpet, bank, templates }); } catch (e) { console.error('Sample options could not be priced:', e); return null; }
  }, [size, carpet, bank, templates]);

  usePageHeader({
    actions: book ? <Button variant="primary" icon={Presentation} onClick={() => setPresenting(true)}>Present to client</Button> : undefined,
  }, [!!book]);

  if (!sample.sizes.length) {
    return <EmptyState icon={Home} title="No home sizes to sample" text="Add a 1-BHK, 2-BHK or 3-BHK typology in Templates & Bank > Standard templates, and its options appear here." />;
  }

  return (
    <div className="space-y-6">
      <Panel icon={Home} title="The home"
        blurb="Pick the size the client is asking about. The options are priced from your Item bank, Standard templates and Option setup. Nothing is saved and no project is made.">
        <HomeControls {...sample} />
        {book && <p className="text-[11px] text-slate-500 mt-3">{bandLine(book)} Room amounts are for {book.carpet.toLocaleString('en-IN')} sq ft.</p>}
      </Panel>

      {book ? (
        <div key={`${size}-${carpet}`} className="hud-swap">
          <SampleBody book={book} />
        </div>
      ) : (
        <EmptyState icon={Gem} title="No options could be priced"
          text={bank.length ? `The ${size} template has no items the Item bank can price. Add items to its rooms in Standard templates.` : 'The Item bank is still loading, or has no items yet.'} />
      )}

      {presenting && book && <Presenting book={book} sample={sample} studio={(orgData as any)?.name} onClose={stopPresenting} />}
    </div>
  );
}

