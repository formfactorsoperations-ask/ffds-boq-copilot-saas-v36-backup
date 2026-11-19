import React, { useEffect, useMemo, useState } from 'react';
import { Search, Check, Lock, Info, X } from 'lucide-react';
import { Button, Chip, EmptyState, LABEL, INPUT } from '../ui/kit';
import { useOrg } from '../../contexts/OrgContext';
import type { Item, FullProjectData } from '../../types';
import {
  materialsIn, currentVersion, versionsOf, saveNewVersion, newVersionProblem, addMaterial, canEditMaterialSpecs,
  GRADES, rangeLabel, type Material, type Grade, type MaterialSpecsBank, type MaterialRange,
} from '../../lib/materialSpecs';
import { recipeOf, sentTierIds } from '../../lib/lineSpecs';
import type { MaterialSpecsState } from './useMaterialSpecs';
import Swatch from './Swatch';

/*
  The Material specs bank, in Templates & Bank (the approved mockup's screen).

  Families on the left; the family's materials in the middle, each with what it
  says, its brand, the options it is used at and where it is used; the picked
  material on the right, where the Owner changes its words or brand and saves
  them as a new version, with its history and the items built with it.

  A saved version is never changed: lines added from then on take the new
  version, draft options are offered it, and options already sent, signed or in
  execution keep theirs.

  A material priced as a range (PR M) shows the range: how many shades it
  holds, the examples clients see, and what it holds. The Owner adds or removes
  an example, which saves as a new version like any other change.
*/

const GRADE_NAME: Record<Grade, string> = { E: 'Essential', C: 'Comfort', P: 'Premium' };
const SUFFIX: Record<string, string> = { ply: ' carcass', lam: ' outside', inner: ' inside', top: ' counter' };
/* "Every shade in this range costs the same": the unit, one of. */
const oneOf = (unit: string) => (unit === 'species' ? 'species' : unit === 'colours' ? 'colour' : 'shade');
const sameRange = (a?: MaterialRange, b?: MaterialRange) => JSON.stringify(a || null) === JSON.stringify(b || null);

/** A range's first examples as dots, and its size. */
function RangeDots({ r, className = '' }: { r: MaterialRange; className?: string }) {
  return (
    <div className={`${className} flex items-center gap-1`}>
      {r.examples.slice(0, 8).map(e => <span key={e.name} title={e.name} className="w-4 h-4 rounded-full border border-slate-200" style={{ background: e.hex }} />)}
      <span className="ml-1 text-[11px] font-bold text-slate-500">{rangeLabel(r)}</span>
    </div>
  );
}

const when = (at: number) => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'the studio standard');

interface Usage { items: Item[]; lines: number; projects: number }

export default function MaterialSpecsTab({ specs, items = [], projects = [], addSignal = 0, onOpenItem }: {
  specs: MaterialSpecsState;
  /** The Item Bank, for the items built with each material. */
  items?: Item[];
  /** The studio's projects, for the BOQ lines that name each material. */
  projects?: FullProjectData[];
  /** Bumped by the header's New material. */
  addSignal?: number;
  onOpenItem?: (item: Item) => void;
}) {
  const { currentRole, currentRoles, currentUserAuth } = useOrg() as any;
  const canEdit = canEditMaterialSpecs(currentRole, currentRoles);
  const me = currentUserAuth?.displayName || currentUserAuth?.email || 'Owner';
  const bank = specs.bank;

  const [famId, setFamId] = useState<string>(bank.families[0]?.id || '');
  const [selMat, setSelMat] = useState<string>('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<{ id: string; words: string; brand: string; note: string; factor: string; range?: MaterialRange } | null>(null);
  const [eg, setEg] = useState<{ name: string; hex: string; code: string } | null>(null);
  const [saved, setSaved] = useState<{ id: string; v: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newMat, setNewMat] = useState({ name: '', words: '', brand: '', grades: [] as Grade[] });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  useEffect(() => { if (addSignal) { setAdding(true); setDraft(null); setSaved(null); } }, [addSignal]);

  const fam = bank.families.find(f => f.id === famId) || bank.families[0];
  const list = (fam ? materialsIn(bank, fam.id) : []).filter(m => !q.trim() || `${m.name} ${currentVersion(bank, m.id)?.words || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const mat = bank.materials.find(m => m.id === selMat && m.fam === fam?.id) || list[0];

  /* Where each material is used: items whose recipe names it, and BOQ lines that do. */
  const usage = useMemo(() => {
    const out = new Map<string, Usage>();
    const get = (id: string) => { let u = out.get(id); if (!u) { u = { items: [], lines: 0, projects: 0 }; out.set(id, u); } return u; };
    items.forEach(it => {
      const r = recipeOf(it, bank);
      const ids = new Set<string>();
      r?.parts.forEach(p => GRADES.forEach(g => ids.add(p.byGrade[g])));
      ids.forEach(id => get(id).items.push(it));
    });
    projects.forEach(p => {
      const seen = new Set<string>();
      (p.tiers || []).forEach(t => (t.boq || []).forEach((l: any) => Object.values(l.materialSpecs || {}).forEach((s: any) => {
        get(s.id).lines++; seen.add(s.id);
      })));
      seen.forEach(id => { get(id).projects++; });
    });
    return out;
  }, [items, projects, bank]);
  const use = (id: string) => usage.get(id) || { items: [], lines: 0, projects: 0 };

  const persist = async (next: MaterialSpecsBank) => {
    setBusy(true); setNote(null);
    try { await specs.save(next); return true; } catch (e: any) { setNote({ tone: 'bad', text: e?.message || String(e) }); return false; } finally { setBusy(false); }
  };

  if (specs.error) return <EmptyState icon={Lock} title="The Material specs bank could not be read" text={specs.error} />;

  const pick = (m: Material) => { setSelMat(m.id); setDraft(null); setSaved(null); setAdding(false); setNote(null); setEg(null); };
  const cur = mat ? currentVersion(bank, mat.id) : undefined;
  const d = draft && mat && draft.id === mat.id ? draft : mat ? { id: mat.id, words: cur?.words || '', brand: cur?.brand || '', note: '', factor: String(cur?.costFactor ?? 1), range: cur?.range } : null;
  const rangeChanged = !!(d && cur && !sameRange(d.range, cur.range));
  const changed = !!(d && cur && (d.words !== cur.words || d.brand !== (cur.brand || '') || (fam?.finish && Number(d.factor) !== Number(cur.costFactor ?? 1)) || rangeChanged));
  /* The range as it would be saved: an example added or removed. */
  const setExamples = (examples: MaterialRange['examples']) => { if (d?.range) { setDraft({ ...d, range: { ...d.range, examples } }); setSaved(null); } };
  const addExample = () => {
    if (!eg || !d?.range) return;
    if (!eg.name.trim()) { setNote({ tone: 'bad', text: 'Name the example, as the sample board does.' }); return; }
    setExamples([...d.range.examples, { name: eg.name.trim(), hex: eg.hex, ...(eg.code.trim() ? { code: eg.code.trim() } : {}) }]);
    setEg(null); setNote(null);
  };

  const saveVersion = async () => {
    if (!mat || !d) return;
    const next = { words: d.words, brand: d.brand, note: d.note || (rangeChanged ? 'Range examples changed' : 'Words or brand changed'), ...(fam?.finish ? { costFactor: Number(d.factor) || 1 } : {}), ...(rangeChanged ? { range: d.range } : {}) };
    const problem = newVersionProblem(bank, mat.id, next);
    if (problem) { setNote({ tone: 'bad', text: problem }); return; }
    const v = (cur?.v || 0) + 1;
    if (await persist(saveNewVersion(bank, mat.id, next, me, Date.now()))) {
      setDraft(null); setEg(null); setSaved({ id: mat.id, v });
      setNote({ tone: 'good', text: `${mat.name} saved as v${v}. New lines use it from now on.` });
    }
  };
  const saveNewMaterial = async () => {
    if (!fam) return;
    try {
      const next = addMaterial(bank, { fam: fam.id, ...newMat, ...(fam.finish ? { costFactor: 1 } : {}) }, me, Date.now());
      if (await persist(next)) {
        const added = next.materials[next.materials.length - 1];
        setAdding(false); setNewMat({ name: '', words: '', brand: '', grades: [] }); setSelMat(added.id);
        setNote({ tone: 'good', text: `${added.name} added at v1.` });
      }
    } catch (e: any) { setNote({ tone: 'bad', text: e?.message || String(e) }); }
  };

  /* After a save: each project that names the material, and whether it moves. */
  const projectRows = saved && mat && saved.id === mat.id ? projects.map(p => {
    const sent = sentTierIds(p.context as any);
    let n = 0, draftOld = 0;
    (p.tiers || []).forEach(t => (t.boq || []).forEach((l: any) => Object.values(l.materialSpecs || {}).forEach((s: any) => {
      if (s.id !== mat.id) return;
      n++;
      if (!sent.has(t.id) && !p.context?.boqFrozen && s.v < saved.v) draftOld++;
    })));
    const status = p.context?.boqFrozen ? 'Frozen' : (p.tiers || []).some(t => sent.has(t.id)) ? 'Proposal sent' : 'Draft';
    return { id: p.id, name: p.context?.name || 'Project', status, n, canUpdate: draftOld > 0 };
  }).filter(r => r.n > 0) : [];

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_400px] items-start">
      <nav className="rounded-3xl bg-white border border-slate-200 p-2 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Material families">
        {bank.families.map(f => {
          const on = f.id === fam?.id;
          return (
            <button key={f.id} type="button" onClick={() => { setFamId(f.id); setSelMat(''); setDraft(null); setSaved(null); setAdding(false); setQ(''); setEg(null); }}
              aria-current={on ? 'true' : undefined}
              className={`shrink-0 lg:w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 ${on ? 'bg-[#3D52A0] text-white shadow-sm hud-rail-active' : 'text-slate-700 hover:bg-slate-100'}`}>
              <span className="whitespace-nowrap">{f.name}</span>
              <span className={`text-[11px] tabular-nums ${on ? 'text-white/80' : 'text-slate-400'}`}>{materialsIn(bank, f.id).length}</span>
            </button>
          );
        })}
      </nav>

      {fam && (
        <section key={fam.id} className="rounded-3xl bg-white border border-slate-200 p-4 min-w-0 hud-swap">
          <div className="flex items-center justify-between gap-2 px-1 mb-3 flex-wrap">
            <div>
              <h2 className="font-bold text-slate-800">{fam.name}</h2>
              <p className="text-xs text-slate-500">{(() => {
                const all = materialsIn(bank, fam.id);
                const rs = all.map(m => currentVersion(bank, m.id)?.range).filter(Boolean) as MaterialRange[];
                return rs.length
                  ? `${all.length} materials · ${rs.length} priced as ranges, ${rs.reduce((a, r) => a + r.count, 0).toLocaleString('en-IN')}+ ${fam.finish ? 'shades' : 'choices'} in all · a line names the range, the client picks at Selections`
                  : `${all.length} materials · each line in a BOQ names one of these, at a version`;
              })()}</p>
            </div>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search materials…" aria-label="Search materials" className={`${INPUT} !pl-8 !py-1.5`} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {list.map((m, i) => {
              const h = currentVersion(bank, m.id);
              const u = use(m.id);
              const on = mat?.id === m.id;
              const factor = Number(h?.costFactor ?? 1);
              return (
                <button key={m.id} type="button" onClick={() => pick(m)} aria-pressed={on}
                  className={`hud-row-in text-left rounded-2xl border p-4 transition-colors ${on ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/20 bg-[#3D52A0]/[0.03]' : 'border-slate-200 hover:border-slate-300'}`}
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-start gap-3">
                    <Swatch mat={m} className="w-10 h-10 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-bold text-slate-800">{m.name}</span><Chip tone="brand">v{h?.v || 1}</Chip></div>
                      <div className="text-xs text-slate-500 mt-0.5">{h?.brand}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 line-clamp-2">“{h?.words}”</p>
                  {h?.range && <RangeDots r={h.range} className="mt-2" />}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {GRADES.map(g => <span key={g} className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${m.grades.includes(g) ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}>{GRADE_NAME[g]}</span>)}
                    {fam.finish && factor !== 1 && <span className="text-[10px] font-bold text-slate-500">{factor > 1 ? '+' : '−'}{Math.round(Math.abs(factor - 1) * 100)}% on cost</span>}
                    <span className="ml-auto text-[11px] text-slate-500 tabular-nums">{u.items.length} items · {u.lines} lines</span>
                  </div>
                </button>
              );
            })}
            {list.length === 0 && <p className="text-xs text-slate-500 px-1">No material in this family matches.</p>}
          </div>
        </section>
      )}

      <div className="lg:col-span-2 xl:col-span-1 min-w-0">
        {adding && canEdit && fam ? (
          <section className="rounded-3xl bg-white border border-slate-200 p-5 space-y-3 hud-panel-in">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{fam.name}</div>
            <h2 className="text-lg font-bold text-slate-800">New material</h2>
            <div><label htmlFor="nm-name" className={`${LABEL} block mb-1.5`}>Material</label><input id="nm-name" className={INPUT} value={newMat.name} onChange={e => setNewMat({ ...newMat, name: e.target.value })} placeholder="e.g. Hettich soft-close system" /></div>
            <div><label htmlFor="nm-words" className={`${LABEL} block mb-1.5`}>Words the client reads</label><textarea id="nm-words" rows={3} className={INPUT} value={newMat.words} onChange={e => setNewMat({ ...newMat, words: e.target.value })} /></div>
            <div><label htmlFor="nm-brand" className={`${LABEL} block mb-1.5`}>Brand or equivalent</label><input id="nm-brand" className={INPUT} value={newMat.brand} onChange={e => setNewMat({ ...newMat, brand: e.target.value })} /></div>
            <div>
              <span className={`${LABEL} block mb-1.5`}>Used in options</span>
              <div className="flex flex-wrap gap-1">
                {GRADES.map(g => {
                  const on = newMat.grades.includes(g);
                  return <button key={g} type="button" aria-pressed={on} onClick={() => setNewMat({ ...newMat, grades: on ? newMat.grades.filter(x => x !== g) : [...newMat.grades, g] })}
                    className={`px-2 py-1.5 rounded-lg text-xs font-bold ${on ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}>{GRADE_NAME[g]}</button>;
                })}
              </div>
            </div>
            <div className="flex gap-2"><Button size="sm" variant="primary" icon={Check} onClick={saveNewMaterial} disabled={busy}>Add at v1</Button><Button size="sm" onClick={() => setAdding(false)}>Cancel</Button></div>
            {note && <p role="status" className={`text-xs ${note.tone === 'bad' ? 'text-rose-700' : 'text-emerald-700'}`}>{note.text}</p>}
          </section>
        ) : mat && d && (
          <section key={mat.id} className="rounded-3xl bg-white border border-slate-200 overflow-hidden xl:sticky xl:top-4 hud-panel-in">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <Swatch mat={mat} className="w-12 h-12 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{fam?.name}</div>
                  <h2 className="text-lg font-bold text-slate-800">{mat.name}</h2>
                  <div className="text-xs text-slate-500">Version {cur?.v} · {cur?.at ? `current since ${when(cur.at)}` : 'the studio standard'} · {use(mat.id).items.length} items, {use(mat.id).lines} BOQ lines in {use(mat.id).projects} projects</div>
                </div>
              </div>
            </div>
            {d.range && (
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between gap-2"><span className={LABEL}>Priced as a range</span><Chip tone="brand">{rangeLabel(d.range)}</Chip></div>
                <p className="text-xs text-slate-600 mt-1.5">Every {oneOf(d.range.unit)} in this range costs the same. A BOQ line names the range; the client picks the exact one at Selections, after design approval, with no change in price.</p>
                <div className="mt-3 grid grid-cols-4 gap-1.5" role="list" aria-label={`${mat.name}: examples`}>
                  {d.range.examples.map((e, i) => (
                    <div key={`${e.name}-${i}`} role="listitem" className="group relative rounded-lg border border-slate-200 p-1" title={e.code ? `${e.name} · ${e.code}` : e.name}>
                      <span className="block h-7 rounded" style={{ background: e.hex }} />
                      <span className="block text-[10px] font-semibold text-slate-600 truncate mt-0.5">{e.name}</span>
                      {canEdit && (
                        <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setExamples(d.range!.examples.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-slate-300 text-slate-500 grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-600">
                          <X className="w-2.5 h-2.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button type="button" aria-expanded={!!eg} onClick={() => setEg(eg ? null : { name: '', hex: '#c9a37a', code: '' })}
                      className="rounded-lg border border-dashed border-slate-300 text-[11px] font-bold text-[#3D52A0] hover:bg-slate-50">+ Example</button>
                  )}
                </div>
                {eg && canEdit && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-end hud-panel-in">
                    <label className="block"><span className="sr-only">Colour</span><input type="color" aria-label="Colour" value={eg.hex} onChange={e => setEg({ ...eg, hex: e.target.value })} className="w-10 h-9 rounded-lg border border-slate-300 bg-white p-0.5" /></label>
                    <div><label htmlFor="eg-name" className={`${LABEL} block mb-1`}>Example</label><input id="eg-name" className={`${INPUT} !py-1.5`} value={eg.name} onChange={e => setEg({ ...eg, name: e.target.value })} placeholder="e.g. Smoked oak" /></div>
                    <div><label htmlFor="eg-code" className={`${LABEL} block mb-1`}>Catalogue code</label><input id="eg-code" className={`${INPUT} !py-1.5`} value={eg.code} onChange={e => setEg({ ...eg, code: e.target.value })} placeholder="e.g. Merino 21071" /></div>
                    <div className="col-span-3 flex gap-2"><Button size="sm" variant="primary" icon={Check} onClick={addExample}>Add example</Button><Button size="sm" onClick={() => setEg(null)}>Cancel</Button></div>
                  </div>
                )}
                <div className="mt-2 text-[11px] text-slate-500">{d.range.kinds}{cur?.brand ? ` · ${cur.brand}` : ''}</div>
                <div className="text-[11px] text-slate-500">Clients see these examples; the full catalogue stays with the sample boards in the studio.</div>
              </div>
            )}
            <div className="p-5 space-y-4">
              {saved && saved.id === mat.id && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 hud-panel-in">
                  <div className="text-sm font-bold text-emerald-800 flex items-center gap-1.5"><Check className="w-4 h-4" aria-hidden />Saved as version {saved.v}</div>
                  <p className="text-xs text-emerald-800/80 mt-1">Every line added from today uses v{saved.v}. Draft options can update when you say so. Options already sent to the client, signed or in execution stay on v{saved.v - 1}.</p>
                  {projectRows.length > 0 && (
                    <div className="mt-3 rounded-xl bg-white border border-emerald-100 divide-y divide-slate-100">
                      {projectRows.map(r => (
                        <div key={r.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                          <span className="flex-1 min-w-0"><span className="block font-semibold text-slate-800 truncate">{r.name}</span><span className="block text-[11px] text-slate-500">{r.status} · <span className="tabular-nums">{r.n} lines</span></span></span>
                          {r.canUpdate ? <Chip tone="brand">Update in its BOQ</Chip> : <Chip tone="slate">Stays on v{saved.v - 1}</Chip>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="ms-words" className={`${LABEL} block mb-1.5`}>Words the client reads</label>
                <textarea id="ms-words" rows={3} className={INPUT} value={d.words} disabled={!canEdit} onChange={e => { setDraft({ ...d, words: e.target.value }); setSaved(null); }} />
                <p className="text-[11px] text-slate-500 mt-1">Used inside every line built from this material, e.g. “…{d.words}{SUFFIX[mat.fam] || ''}…”</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="ms-brand" className={`${LABEL} block mb-1.5`}>Brand or equivalent</label><input id="ms-brand" className={INPUT} value={d.brand} disabled={!canEdit} onChange={e => { setDraft({ ...d, brand: e.target.value }); setSaved(null); }} /></div>
                <div>
                  <span className={`${LABEL} block mb-1.5`}>Used in options</span>
                  <div className="flex flex-wrap gap-1">{GRADES.map(g => <span key={g} className={`px-2 py-1.5 rounded-lg text-xs font-bold ${mat.grades.includes(g) ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}>{GRADE_NAME[g]}</span>)}</div>
                </div>
              </div>
              {fam?.finish ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-3">
                  <span className={LABEL}>Cost effect</span>
                  {canEdit ? (
                    <span className="flex items-center gap-1">
                      <input aria-label="Cost factor" inputMode="decimal" value={d.factor} onChange={e => { setDraft({ ...d, factor: e.target.value }); setSaved(null); }}
                        className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-sm font-black tabular-nums text-right" />
                      <span className="text-xs text-slate-500">× materials</span>
                    </span>
                  ) : (
                    <span className="text-sm font-black tabular-nums">{Number(cur?.costFactor ?? 1) === 1 ? 'Base' : `${Number(cur?.costFactor) > 1 ? '+' : '−'}${Math.round(Math.abs(Number(cur?.costFactor) - 1) * 100)}% on materials`}</span>
                  )}
                  <span className="text-[11px] text-slate-500 ml-auto inline-flex items-center gap-1"><Lock className="w-3 h-3 text-[#3D52A0]" aria-hidden />studio only</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Info className="w-3 h-3" aria-hidden />Changes words only. Of all materials, only outer finishes change cost.</p>
              )}

              {changed && canEdit && (
                <div className="rounded-2xl border border-[#3D52A0]/25 bg-[#3D52A0]/[0.04] p-4 space-y-3 hud-panel-in">
                  <div className="text-sm font-bold text-slate-800">This becomes version {(cur?.v || 0) + 1}</div>
                  <div className="text-xs text-slate-600 space-y-1.5">
                    {d.words !== cur?.words && <>
                      <div className="line-through text-slate-400">{cur?.words}</div>
                      <div className="font-semibold text-slate-800">{d.words}</div>
                    </>}
                    {d.brand !== (cur?.brand || '') && <div><span className="line-through text-slate-400">{cur?.brand}</span> → <b>{d.brand}</b></div>}
                    {rangeChanged && d.range && cur?.range && (() => {
                      const was = new Set(cur.range.examples.map(e => e.name));
                      const now = new Set(d.range.examples.map(e => e.name));
                      const added = d.range.examples.filter(e => !was.has(e.name)).map(e => e.name);
                      const gone = cur.range.examples.filter(e => !now.has(e.name)).map(e => e.name);
                      return <div>{added.length > 0 && <>Examples added: <b>{added.join(', ')}</b>. </>}{gone.length > 0 && <>Removed: <span className="line-through text-slate-400">{gone.join(', ')}</span>.</>}</div>;
                    })()}
                  </div>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
                    <li>New lines use v{(cur?.v || 0) + 1} from the moment you save.</li>
                    <li>Draft options using v{cur?.v} show “v{(cur?.v || 0) + 1} available” and update when someone presses Update.</li>
                    <li>Options already sent to the client, signed or in execution stay on v{cur?.v}.</li>
                  </ul>
                  <div><label htmlFor="ms-note" className={`${LABEL} block mb-1.5`}>What changed, for the history</label><input id="ms-note" className={INPUT} value={d.note} onChange={e => setDraft({ ...d, note: e.target.value })} placeholder="e.g. Hafele named instead of Ebco" /></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="primary" icon={Check} onClick={saveVersion} disabled={busy}>{busy ? 'Saving…' : `Save as v${(cur?.v || 0) + 1}`}</Button>
                    <Button size="sm" onClick={() => { setDraft(null); setEg(null); }}>Discard</Button>
                    <span className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Lock className="w-3 h-3 text-[#3D52A0]" aria-hidden />Only the studio Owner saves versions</span>
                  </div>
                </div>
              )}
              {!canEdit && <p className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Lock className="w-3 h-3 text-[#3D52A0]" aria-hidden />Read-only: only the studio Owner saves versions.</p>}
              {note && <p role="status" className={`text-xs ${note.tone === 'bad' ? 'text-rose-700' : 'text-emerald-700'}`}>{note.text}</p>}

              <div>
                <div className={`${LABEL} mb-2`}>History</div>
                <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3" aria-label={`${mat.name}: versions`}>
                  {[...versionsOf(bank, mat.id)].reverse().map(x => (
                    <li key={x.v} className="pl-4 relative">
                      <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${x.v === cur?.v ? 'bg-[#3D52A0]' : 'bg-slate-300'} ring-2 ring-white`} />
                      <div className="text-xs font-bold text-slate-800">v{x.v}{x.v === cur?.v ? ' · current' : ''} <span className="font-semibold text-slate-500">· {x.at ? `${when(x.at)} · ${x.by}` : x.by}</span></div>
                      <div className="text-[11px] text-slate-600">{x.note}</div>
                      <div className="text-[11px] text-slate-400 italic">“{x.words}”{x.brand ? ` · ${x.brand}` : ''}</div>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <div className={`${LABEL} mb-2`}>Items built with it</div>
                <div className="flex flex-wrap gap-1.5">
                  {use(mat.id).items.map(it => (
                    <button key={it.id} type="button" onClick={() => onOpenItem?.(it)} className="px-2.5 py-1 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#3D52A0]/40">{it.name}</button>
                  ))}
                  {use(mat.id).items.length === 0 && <span className="text-xs text-slate-500">No item uses it yet.</span>}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
