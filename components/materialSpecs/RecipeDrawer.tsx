import React, { useMemo, useState } from 'react';
import { X, Plus, Check, Lock } from 'lucide-react';
import { Button, LABEL } from '../ui/kit';
import type { Item } from '../../types';
import { basisOfUnit } from '../../lib/boqSize';
import { drawOf } from '../../lib/playground/pieces';
import { ftin } from '../../lib/playground/geometry';
import { GRADES, GRADE_TIER, currentVersion, materialsIn, setRecipePart, type Grade, type MaterialSpecsBank } from '../../lib/materialSpecs';
import { recipeOf, suggestedRecipeId, specsFromRecipe, composeWords } from '../../lib/lineSpecs';
import { PieceThumb } from '../playground/pieceArt';
import { inr } from '../playground/playgroundUi';
import Swatch from './Swatch';

/*
  An Item Bank item's drawer (the approved mockup's), opened from the Item bank,
  from a material's "Items built with it", and from a BOQ line's "Item recipe".

  The spec recipe: which material fills each part of the item for each option.
  Lines added from the item copy the current version of each. The recipe is
  shared by every item of its kind, so changing it is the Owner's. Then what
  the client reads at each option, and how the item sits on the plan.

  An item with no recipe keeps the words typed into the Item Bank; Start a
  recipe gives it one, from its kind.
*/

const RULE: Record<string, string> = { area: 'Width × height', length: 'Running length', count: 'Counted', lump: 'Typed' };

export default function RecipeDrawer({ item, specs, canEditRecipes, canEditItem, projects, sharedBy, onSave, onClose }: {
  item: Item;
  specs: MaterialSpecsBank;
  canEditRecipes: boolean;
  canEditItem: boolean;
  /** How many projects use the item. */
  projects: number;
  /** How many Item Bank items a recipe is shared by. */
  sharedBy: (recipeId: string) => number;
  /** Writes what changed: the item's recipe, and the bank when a recipe part changed. */
  onSave: (change: { recipeId?: string | null; bank?: MaterialSpecsBank }) => Promise<void> | void;
  onClose: () => void;
}) {
  const [recipeId, setRecipeId] = useState<string | null | undefined>(undefined);
  const [bank, setBank] = useState<MaterialSpecsBank>(specs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownItem = recipeId === undefined ? item : { ...item, recipeId };
  const recipe = recipeOf(shownItem, bank);
  const suggested = suggestedRecipeId(item);
  const draw = drawOf(item);
  const [startFrom, setStartFrom] = useState<string>('');
  const recipeChanged = bank !== specs;
  const itemChanged = recipeId !== undefined;
  const recipes = useMemo(() => Object.values(bank.recipes), [bank]);

  const setPart = (part: string, g: Grade, mat: string) => {
    if (!recipe) return;
    try { setBank(b => setRecipePart(b, recipe.id, part, g, mat, 'Owner', Date.now())); setError(null); } catch (e: any) { setError(e?.message || String(e)); }
  };
  const save = async () => {
    if (!itemChanged && !recipeChanged) { onClose(); return; }
    setSaving(true);
    try {
      await onSave({ ...(itemChanged ? { recipeId } : {}), ...(recipeChanged ? { bank } : {}) });
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300]">
      <div className="absolute inset-0 phd-scrim bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[780px] bg-white shadow-2xl flex flex-col hud-panel-in" role="dialog" aria-modal="true" aria-labelledby="recipe-drawer-title">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
          {draw && <span className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0"><PieceThumb kind={draw.kind} w={draw.w} d={draw.d} words={item.specs} className="w-14 h-14" /></span>}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Item bank · {item.cat}</div>
            <h2 id="recipe-drawer-title" className="text-lg font-bold text-slate-800">{item.name}</h2>
            <div className="text-xs text-slate-500">{inr((Number(item.materials) || 0) + (Number(item.labor) || 0))} per {item.unit} · {item.margin}% margin · in {projects} project{projects === 1 ? '' : 's'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {recipe ? (
            <>
              <div>
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="font-bold text-slate-800">Spec recipe</div>
                    <div className="text-xs text-slate-500">Which material fills each part, for each option. Lines added from this item copy the current version of each.</div>
                  </div>
                  {canEditItem && (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={LABEL}>Kind</span>
                      <select value={recipe.id} onChange={e => setRecipeId(e.target.value === '__none' ? null : e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white" aria-label="Recipe kind">
                        {recipes.map(r => <option key={r.id} value={r.id}>{r.name}{r.id === suggested && item.recipeId === undefined && recipeId === undefined ? ' (suggested)' : ''}</option>)}
                        <option value="__none">No recipe: words typed by hand</option>
                      </select>
                    </label>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 600, tableLayout: 'fixed' }}>
                    <colgroup><col style={{ width: 112 }} /><col /><col /><col /></colgroup>
                    <thead><tr className={`bg-slate-50 ${LABEL}`}><th className="text-left px-3 py-2">Part</th>{GRADES.map(g => <th key={g} className="text-left px-3 py-2">{GRADE_TIER[g]}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {recipe.parts.map(p => (
                        <tr key={p.part}>
                          <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{p.part}{p.finish && <div className="text-[10px] font-bold text-[#3D52A0]">finish swatch</div>}</td>
                          {GRADES.map(g => {
                            const m = bank.materials.find(x => x.id === p.byGrade[g]);
                            return (
                              <td key={g} className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <Swatch mat={m} className="w-5 h-5 rounded-md" />
                                  <select aria-label={`${p.part} in ${GRADE_TIER[g]}`} value={p.byGrade[g]} disabled={!canEditRecipes}
                                    onChange={e => setPart(p.part, g, e.target.value)}
                                    className="min-w-0 flex-1 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white disabled:bg-slate-50">
                                    {materialsIn(bank, p.fam).map(x => <option key={x.id} value={x.id}>{x.name} · v{currentVersion(bank, x.id)?.v || 1}</option>)}
                                  </select>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Changing the recipe affects lines added from now on. It is shared by {sharedBy(recipe.id)} item{sharedBy(recipe.id) === 1 ? '' : 's'} of this kind.
                  {!canEditRecipes && <span className="inline-flex items-center gap-1 ml-1"><Lock className="w-3 h-3 text-[#3D52A0]" aria-hidden />Only the studio Owner changes a recipe.</span>}
                </p>
              </div>
              <div>
                <div className="font-bold text-slate-800 mb-2">What the client reads, by option</div>
                <div className="space-y-2">
                  {GRADES.map(g => (
                    <div key={g} className={`rounded-xl border p-3 ${g === 'C' ? 'border-[#3D52A0]/30 bg-[#3D52A0]/[0.03]' : 'border-slate-200'}`}>
                      <div className={`${LABEL} mb-1`}>{GRADE_TIER[g]}</div>
                      <p className="text-sm text-slate-700">{composeWords(bank, specsFromRecipe(bank, recipe, g))}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-bold text-slate-800">No recipe yet</div>
              <p className="text-xs text-slate-600 mt-1">Its words are typed by hand: “{item.specs || 'none yet'}”. Give it a recipe and its words come from the Material specs, versioned, like every other item.</p>
              {canEditItem && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <select aria-label="Start from" value={startFrom || suggested || recipes[0]?.id || ''} onChange={e => setStartFrom(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white">
                    {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <Button size="sm" icon={Plus} onClick={() => setRecipeId(startFrom || suggested || recipes[0]?.id || null)}>Start a recipe</Button>
                </div>
              )}
            </div>
          )}

          {draw && (
            <div>
              <div className="font-bold text-slate-800 mb-2">On the plan</div>
              <div className="rounded-2xl border border-slate-200 p-3 flex items-center gap-4">
                <span className="w-28 h-20 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden"><PieceThumb kind={draw.kind} w={draw.w} d={draw.d} words={item.specs} className="w-28 h-20" /></span>
                <div className="text-xs text-slate-600 space-y-1">
                  <div>Default size <b className="tabular-nums">{ftin(draw.w)} × {ftin(draw.h)} high × {ftin(draw.d)} deep</b></div>
                  <div>Quantity rule <b>{RULE[basisOfUnit(item.unit) || 'count'] || 'Counted'}</b></div>
                  <div>Looks like <b>{draw.kind}</b> from above</div>
                </div>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Check} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save item'}</Button>
        </div>
      </aside>
    </div>
  );
}
