import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Sprout, Gem, Crown, Presentation, X, ChevronDown, Check, Minus, LayoutGrid, Plus, IndianRupee } from 'lucide-react';
import type { Item } from '../../types';
import type { TemplateData } from '../../lib/standardPackages';
import {
  sampleOptions, sampleRatesOf, SAMPLE_SIZES, DEFAULT_SAMPLE_SIZE, DEFAULT_SAMPLE_RATES, RATE_LIMITS, OPTION_NAMES,
  typicalCarpetOf, usualAreasOf, inLakhs, type SampleBook, type SampleOption, type SampleRates,
} from '../../lib/sampleOptions';
import { GRADES } from '../../lib/materialSpecs';
import { holdsFinanceRole } from '../../lib/roleAccess';
import { Panel, Button, Segmented, IconChip, LABEL, INPUT } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import { useOrg } from '../../contexts/OrgContext';
import '../projectHeader/projectHeader.css';

/*
  Sample options (asked for 28 Nov 2026): the three options for a typical home,
  to show a client at the first meeting, before there is a project or a BOQ.

  Each option is a range: the carpet area times the studio's rate per sq ft for
  that option, low and high (lib/sampleOptions). The owner sets the rates here
  ("Set the rates"); they are saved on the studio record. What each option
  includes comes from the studio's Standard templates. Nothing else is saved.
  A client may be watching, so there is never a cost or a margin here.
  "Present to client" shows the same thing full screen, without the app.
*/

const MEDAL = [Sprout, Gem, Crown];

interface Props {
  bank: Item[];
  templates: TemplateData;
}

/** The size and area the sample is for, shared by the page and the presenting view. */
function useSample() {
  const [size, setSize] = useState(DEFAULT_SAMPLE_SIZE);
  const [carpet, setCarpet] = useState(() => typicalCarpetOf(DEFAULT_SAMPLE_SIZE));
  const pickSize = (s: string) => { setSize(s); setCarpet(typicalCarpetOf(s)); };
  return { size, carpet, setCarpet, pickSize };
}

/** The size switch and the carpet area, with three usual areas to pick from. */
function HomeControls({ size, carpet, setCarpet, pickSize, compact }: ReturnType<typeof useSample> & { compact?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <div>
        <span className={`${LABEL} block mb-1.5`}>Home</span>
        <Segmented size={compact ? 'sm' : 'md'} label="Size of the home" value={size} onChange={pickSize}
          options={SAMPLE_SIZES.map(s => ({ id: s, label: s }))} />
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

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const lakhsRounded = (v: number) => inLakhs(Math.round(v / 10000) * 10000);

/** One option: its range, its rate per sq ft, its finish and what it adds. */
const OptionCard: React.FC<{ option: SampleOption; index: number; previous?: SampleOption }> = ({ option, index, previous }) => {
  const featured = index === 1;
  const adds = previous
    ? [...(option.finish && option.finish !== previous.finish ? [`A better finish: ${option.finish}`] : []), ...option.adds]
    : [];
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
          <CountUp value={option.low} format={lakhsRounded} />
          <span className="text-slate-400 font-bold"> – </span>
          <CountUp value={option.high} format={lakhsRounded} />
        </span>
        <span className="block text-[11px] text-slate-500 tabular-nums mt-1">{rupees(option.rate[0])}–{option.rate[1].toLocaleString('en-IN')} per sq ft</span>
      </div>
      {(previous ? adds.length > 0 : !!option.finish) && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <span className={`${LABEL} block mb-2`}>{previous ? `Adds to ${previous.name}` : 'The essentials'}</span>
          {previous ? (
            <ul className="space-y-1.5">
              {adds.map(a => (
                <li key={a} className="flex items-start gap-2 text-xs text-slate-700">
                  <Plus className="w-3.5 h-3.5 mt-px text-[#3D52A0] shrink-0" aria-hidden />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Every room's furniture and storage and the work across the home, in the standard finish.</p>
          )}
        </div>
      )}
    </article>
  );
};

/** What each option includes, room by room; a room opens to its items. */
function IncludesTable({ book }: { book: SampleBook }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const grades = book.options.map(o => o.grade);
  return (
    <Panel flush icon={LayoutGrid} title="What each option includes"
      blurb="Room by room, from your Standard templates. Open a room to see its items."
      foot="An indication before design and site measurement. Your quote follows once the home is measured and designed. GST extra.">
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
                        <span className="block text-[11px] text-slate-500">{r.area ? `About ${r.area.toLocaleString('en-IN')} sq ft` : r.detail}</span>
                      </span>
                    </button>
                  </th>
                  {grades.map(g => {
                    const n = r.lines.filter(l => l.in.includes(g)).length;
                    return (
                      <td key={g} className="px-4 py-3 text-right text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                        {n ? `${n} ${n === 1 ? 'item' : 'items'}` : <span className="text-slate-400">Not included</span>}
                      </td>
                    );
                  })}
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
              {book.options.map(o => (
                <td key={o.grade} className="px-4 py-3 text-right font-black text-slate-800 tabular-nums whitespace-nowrap">{inLakhs(o.low)} – {inLakhs(o.high)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

/** The options and what they include: what the client sees, on the page and full screen. */
function SampleBody({ book }: { book: SampleBook }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {book.options.map((o, i) => <OptionCard key={o.grade} option={o} index={i} previous={book.options[i - 1]} />)}
      </div>
      {book.rooms.length > 0 && <IncludesTable book={book} />}
    </div>
  );
}

const titleOf = (book: SampleBook) => `Three ways to do a ${book.size} of about ${book.carpet.toLocaleString('en-IN')} sq ft`;

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
            <p className="text-xs text-slate-500 mt-1">Typical ranges for a home this size. Your own quote follows once we have measured and designed your home.</p>
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

/** The owner's rates per sq ft for each option, saved on the studio record. */
function RatesModal({ rates, onSave, onClose }: { rates: SampleRates; onSave: (r: SampleRates) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, [string, string]>>(() =>
    Object.fromEntries(GRADES.map(g => [g, [String(rates[g][0]), String(rates[g][1])]])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const valid = GRADES.every(g => draft[g].every(v => { const n = Number(v); return v.trim() !== '' && n >= RATE_LIMITS[0] && n <= RATE_LIMITS[1]; }));
  const set = (g: string, i: 0 | 1, v: string) => setDraft(prev => { const pair = [...prev[g]] as [string, string]; pair[i] = v; return { ...prev, [g]: pair }; });
  const save = async () => {
    if (!valid) return;
    setSaving(true); setError(null);
    try {
      await onSave(sampleRatesOf(Object.fromEntries(GRADES.map(g => [g, draft[g].map(Number)]))));
      onClose();
    } catch {
      setError('The rates could not be saved. Check the connection and try again.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Set the rates" className="phd-pop relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Sample options</span>
          <h2 className="text-lg font-bold text-slate-800 mt-1">Set the rates</h2>
          <p className="text-xs text-slate-500 mt-1">What each option usually comes to, in ₹ per sq ft of carpet area. The ranges are the carpet area times these. Saved for the whole studio.</p>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {GRADES.map((g, i) => {
            const Icon = MEDAL[i];
            return (
              <div key={g} className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-3 min-w-0 grow basis-40">
                  <IconChip icon={Icon} />
                  <span className="text-sm font-semibold text-slate-800">{OPTION_NAMES[g]}</span>
                </div>
                {(['From', 'To'] as const).map((label, k) => (
                  <label key={label} className="block">
                    <span className={`${LABEL} block mb-1.5`}>{label}, ₹ per sq ft</span>
                    <input type="number" inputMode="numeric" min={RATE_LIMITS[0]} value={draft[g][k]}
                      onChange={(e) => set(g, k as 0 | 1, e.target.value)}
                      className={`${INPUT} !w-28 font-bold tabular-nums`} />
                  </label>
                ))}
              </div>
            );
          })}
          {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <Button variant="quiet" size="sm" onClick={() => setDraft(Object.fromEntries(GRADES.map(g => [g, [String(DEFAULT_SAMPLE_RATES[g][0]), String(DEFAULT_SAMPLE_RATES[g][1])]])))}>
            Use the starting rates
          </Button>
          <span className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!valid || saving}>{saving ? 'Saving…' : 'Save the rates'}</Button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function SampleOptionsScreen({ bank, templates }: Props) {
  const sample = useSample();
  const { size, carpet } = sample;
  const { orgData, updateOrgData, currentRole, currentRoles } = useOrg();
  const rates = useMemo(() => sampleRatesOf(orgData?.sampleRates), [orgData?.sampleRates]);
  const mayEdit = holdsFinanceRole(currentRoles?.length ? currentRoles : currentRole);
  const [presenting, setPresenting] = useState(false);
  const [editing, setEditing] = useState(false);
  /* Stable, so the presenting view does not leave and re-enter full screen each time the sample changes. */
  const stopPresenting = useCallback(() => setPresenting(false), []);
  const stopEditing = useCallback(() => setEditing(false), []);

  const book = useMemo(() => sampleOptions({ size, carpet, rates, bank, templates }), [size, carpet, rates, bank, templates]);

  usePageHeader({
    actions: (
      <div className="flex flex-wrap items-center gap-2">
        {mayEdit && <Button icon={IndianRupee} onClick={() => setEditing(true)}>Set the rates</Button>}
        <Button variant="primary" icon={Presentation} onClick={() => setPresenting(true)}>Present to client</Button>
      </div>
    ),
  }, [mayEdit]);

  return (
    <div className="space-y-6">
      <Panel icon={Home} title="The home"
        blurb="Pick the size and carpet area the client is asking about. The ranges are the area times your rates per sq ft; what each option includes comes from your Standard templates. Nothing is saved and no project is made.">
        <HomeControls {...sample} />
      </Panel>

      <div key={`${size}-${carpet}`} className="hud-swap">
        <SampleBody book={book} />
      </div>

      {presenting && <Presenting book={book} sample={sample} studio={orgData?.orgName} onClose={stopPresenting} />}
      {editing && <RatesModal rates={rates} onClose={stopEditing} onSave={async (r) => { await updateOrgData({ sampleRates: r }); }} />}
    </div>
  );
}
