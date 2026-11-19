import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, History, Plus, Check, Lock } from 'lucide-react';
import { Panel, Button, Chip, EmptyState, LABEL, INPUT } from '../ui/kit';
import { useOrg } from '../../contexts/OrgContext';
import {
  seedFromPackages, materialsIn, currentVersion, versionsOf, saveNewVersion, newVersionProblem, addMaterial,
  canEditMaterialSpecs, GRADES, GRADE_TIER, type MaterialSpecsBank, type Material, type Grade,
} from '../../lib/materialSpecs';
import { watchMaterialSpecs, saveMaterialSpecs } from '../../services/materialSpecsService';

/*
  The Material specs bank, in Templates & Bank (BOQ Playground S1).

  Families on the left, their materials on the right: what each one says to a
  client now, at which option grades it is used, and every version it has had.
  The Owner saves a new version ("Save as v2"); a saved version is never
  changed, so a BOQ sent or signed against it keeps its words. Everyone else
  sees the bank read-only. Until the studio first saves, the bank shows the
  standard package tables it is seeded from.
*/

const GRADE_NAME: Record<Grade, string> = { E: 'Essential', C: 'Comfort', P: 'Premium' };
const when = (at: number) => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Standard');

export default function MaterialSpecsTab({ onStats }: { onStats?: (s: { families: number; materials: number; saved: boolean }) => void }) {
  const { orgData, currentRole, currentRoles, currentUserAuth } = useOrg() as any;
  const tenantId: string | undefined = orgData?.tenantId;
  const canEdit = canEditMaterialSpecs(currentRole, currentRoles);
  const me = currentUserAuth?.displayName || currentUserAuth?.email || 'Owner';

  const [stored, setStored] = useState<MaterialSpecsBank | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seed = useMemo(() => seedFromPackages(), []);
  const bank = stored || seed;

  const [famId, setFamId] = useState<string>('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ words: '', brand: '', note: '', costFactor: '' });
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newMat, setNewMat] = useState({ name: '', words: '', brand: '', grades: [] as Grade[] });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  useEffect(() => watchMaterialSpecs(
    tenantId,
    (b) => { setStored(b); setLoaded(true); setLoadError(null); },
    (e) => { setLoaded(true); setLoadError(e.message); },
  ), [tenantId]);

  useEffect(() => {
    onStats?.({ families: bank.families.length, materials: bank.materials.length, saved: !!stored });
  }, [bank, stored, onStats]);

  const fam = bank.families.find(f => f.id === famId) || bank.families[0];
  const mats = fam ? materialsIn(bank, fam.id) : [];

  const persist = async (next: MaterialSpecsBank, done: string) => {
    setSaving(true); setNote(null);
    try {
      await saveMaterialSpecs(tenantId, next, stored);
      setNote({ tone: 'good', text: done });
      return true;
    } catch (e: any) {
      setNote({ tone: 'bad', text: e?.message || String(e) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (m: Material) => {
    const cur = currentVersion(bank, m.id);
    setEditing(m.id);
    setDraft({ words: cur?.words || '', brand: cur?.brand || '', note: '', costFactor: cur?.costFactor != null ? String(cur.costFactor) : '' });
    setNote(null);
  };

  const saveVersion = async (m: Material) => {
    const next = { words: draft.words, brand: draft.brand, note: draft.note, ...(fam?.finish ? { costFactor: Number(draft.costFactor || 1) } : {}) };
    const problem = newVersionProblem(bank, m.id, next);
    if (problem) { setNote({ tone: 'bad', text: problem }); return; }
    const v = (currentVersion(bank, m.id)?.v || 0) + 1;
    if (await persist(saveNewVersion(bank, m.id, next, me, Date.now()), `${m.name} saved as v${v}. Lines already on BOQs keep the version they have.`)) setEditing(null);
  };

  const saveNewMaterial = async () => {
    if (!fam) return;
    try {
      const next = addMaterial(bank, { fam: fam.id, ...newMat, ...(fam.finish ? { costFactor: 1 } : {}) }, me, Date.now());
      if (await persist(next, `${newMat.name.trim()} added at v1.`)) { setAdding(false); setNewMat({ name: '', words: '', brand: '', grades: [] }); }
    } catch (e: any) {
      setNote({ tone: 'bad', text: e?.message || String(e) });
    }
  };

  if (loadError) {
    return <EmptyState icon={Lock} title="The Material specs bank could not be read" text={loadError} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 mt-6">
      <nav aria-label="Material families" className="space-y-1">
        {bank.families.map((f, i) => {
          const on = f.id === fam?.id;
          return (
            <button key={f.id} type="button" onClick={() => { setFamId(f.id); setEditing(null); setAdding(false); setOpenHistory(null); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between gap-2 hud-row-in ${on ? 'bg-[#3D52A0] text-white shadow-sm hud-rail-active' : 'text-slate-700 hover:bg-slate-100'}`}
              style={{ animationDelay: `${i * 30}ms` }} aria-current={on ? 'true' : undefined}>
              <span className="truncate">{f.name}</span>
              <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-white' : 'text-slate-400'}`}>{materialsIn(bank, f.id).length}</span>
            </button>
          );
        })}
      </nav>

      {fam && (
        <Panel
          key={fam.id}
          icon={Layers3}
          title={fam.name}
          badge={<>{fam.finish && <Chip tone="brand">Outer finish · has a cost factor</Chip>}{!canEdit && <Chip tone="slate">Read-only</Chip>}</>}
          blurb={canEdit
            ? 'Save a new version when what a material is changes. Saved versions never change, so a sent or signed BOQ keeps its words.'
            : 'Only the Owner saves a new version. Lines on BOQs keep the version they were given.'}
          aside={canEdit && !adding ? <Button size="sm" icon={Plus} onClick={() => { setAdding(true); setEditing(null); }}>Add a material</Button> : undefined}
          foot={!stored && loaded ? 'Not saved yet: these are the standard package tables the bank starts from. The Owner’s first save keeps them.' : stored?.updatedAt ? `Last saved ${when(stored.updatedAt)}${stored.updatedBy ? ` by ${stored.updatedBy}` : ''}`.replace(/\.?$/, '.') : undefined}
        >
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {mats.map((m, i) => {
              const cur = currentVersion(bank, m.id);
              const vs = versionsOf(bank, m.id);
              const isEditing = editing === m.id;
              const showHistory = openHistory === m.id;
              return (
                <div key={m.id} className="px-4 py-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{m.name}</span>
                        <Chip tone="slate">v{cur?.v || 1}</Chip>
                        {GRADES.filter(g => m.grades.includes(g)).map(g => <Chip key={g} tone="brand" title={GRADE_TIER[g]}>{GRADE_NAME[g]}</Chip>)}
                      </div>
                      {/* The words, unless they only repeat the name. */}
                      {(cur?.words !== m.name || cur?.brand || (fam.finish && cur?.costFactor != null)) && (
                        <p className="text-xs text-slate-500 mt-1">
                          {[cur?.words !== m.name ? cur?.words : '', cur?.brand, fam.finish && cur?.costFactor != null ? `cost × ${cur.costFactor}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="quiet" icon={History} onClick={() => setOpenHistory(showHistory ? null : m.id)} aria-expanded={showHistory}>
                        {vs.length} version{vs.length === 1 ? '' : 's'}
                      </Button>
                      {canEdit && !isEditing && <Button size="sm" onClick={() => startEdit(m)}>Save as v{(cur?.v || 0) + 1}</Button>}
                    </div>
                  </div>

                  {showHistory && (
                    <ol className="mt-3 rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-100" aria-label={`${m.name}: versions`}>
                      {[...vs].reverse().map(v => (
                        <li key={v.v} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                          <span className="font-bold text-slate-800 tabular-nums">v{v.v}</span>
                          <span className="text-slate-700 flex-1 min-w-0">{v.words}{v.brand ? ` · ${v.brand}` : ''}{v.costFactor != null ? ` · cost × ${v.costFactor}` : ''}</span>
                          <span className="text-[11px] text-slate-500 basis-full sm:basis-auto">{v.note} · {v.by} · {when(v.at)}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {isEditing && (
                    <div className="mt-3 rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/[0.04] p-4 hud-row-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label htmlFor={`ms-words-${m.id}`} className={`${LABEL} block mb-1.5`}>What the client reads</label>
                          <input id={`ms-words-${m.id}`} className={INPUT} value={draft.words} onChange={e => setDraft({ ...draft, words: e.target.value })} />
                        </div>
                        <div>
                          <label htmlFor={`ms-brand-${m.id}`} className={`${LABEL} block mb-1.5`}>Brand or equivalent</label>
                          <input id={`ms-brand-${m.id}`} className={INPUT} value={draft.brand} onChange={e => setDraft({ ...draft, brand: e.target.value })} placeholder="e.g. Ebco equivalent" />
                        </div>
                        {fam.finish ? (
                          <div>
                            <label htmlFor={`ms-factor-${m.id}`} className={`${LABEL} block mb-1.5`}>Cost factor</label>
                            <input id={`ms-factor-${m.id}`} type="number" step={0.05} min={0.05} max={5} className={INPUT} value={draft.costFactor} onChange={e => setDraft({ ...draft, costFactor: e.target.value })} placeholder="1" />
                          </div>
                        ) : <div />}
                        <div className="md:col-span-2">
                          <label htmlFor={`ms-note-${m.id}`} className={`${LABEL} block mb-1.5`}>Why a new version</label>
                          <input id={`ms-note-${m.id}`} className={INPUT} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Telescopic channels named" />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="sm" variant="primary" icon={Check} onClick={() => saveVersion(m)} disabled={saving}>
                          {saving ? 'Saving…' : `Save as v${(cur?.v || 0) + 1}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {mats.length === 0 && <p className="px-4 py-3 text-xs text-slate-500">No materials in this family yet.</p>}
          </div>

          {adding && canEdit && (
            <div className="mt-4 rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/[0.04] p-4 hud-row-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ms-new-name" className={`${LABEL} block mb-1.5`}>Material</label>
                  <input id="ms-new-name" className={INPUT} value={newMat.name} onChange={e => setNewMat({ ...newMat, name: e.target.value })} placeholder="e.g. Hettich soft-close system" />
                </div>
                <div>
                  <label htmlFor="ms-new-brand" className={`${LABEL} block mb-1.5`}>Brand or equivalent</label>
                  <input id="ms-new-brand" className={INPUT} value={newMat.brand} onChange={e => setNewMat({ ...newMat, brand: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="ms-new-words" className={`${LABEL} block mb-1.5`}>What the client reads</label>
                  <input id="ms-new-words" className={INPUT} value={newMat.words} onChange={e => setNewMat({ ...newMat, words: e.target.value })} />
                </div>
                <fieldset className="md:col-span-2">
                  <legend className={`${LABEL} mb-1.5`}>Used at</legend>
                  <div className="flex flex-wrap gap-3">
                    {GRADES.map(g => (
                      <label key={g} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={newMat.grades.includes(g)}
                          onChange={e => setNewMat({ ...newMat, grades: e.target.checked ? [...newMat.grades, g] : newMat.grades.filter(x => x !== g) })} />
                        {GRADE_TIER[g]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                <Button size="sm" variant="primary" icon={Check} onClick={saveNewMaterial} disabled={saving}>Add at v1</Button>
              </div>
            </div>
          )}

          {note && <p role="status" className={`mt-3 text-xs ${note.tone === 'bad' ? 'text-rose-700' : 'text-emerald-700'}`}>{note.text}</p>}
        </Panel>
      )}
    </div>
  );
}
