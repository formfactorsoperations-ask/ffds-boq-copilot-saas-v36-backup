import { civilDaysOf } from '../../lib/playground/brief';
import React, { useState } from 'react';
import { FileText, Plus, Trash2, RotateCcw } from 'lucide-react';
import { Panel, Button, Chip, LABEL, INPUT } from '../ui/kit';
import type { TermsSettings } from '../../types';
import {
  annexureOf, validityDaysOf, ANNEXURE_DEFAULTS, ANNEXURE_SECTIONS, ANNEXURE_TOKENS, DEFAULT_VALIDITY_DAYS,
  newClauseId, type AnnexureKey, type AnnexClause,
} from '../../lib/annexure';

/*
  Annexure A, in Terms & Payment.

  The wording every proposal's Commercial Terms & Conditions print, list by
  list, and how long a proposal holds. A list the studio has not changed prints
  the standard wording; "Use standard wording" puts a changed one back. Saved
  with the rest of Terms & Payment. A clause reworded on one project's
  proposal keeps that project's words.
*/
export default function AnnexureEditor({ terms, onChange }: { terms: TermsSettings; onChange: (next: TermsSettings) => void }) {
  const [section, setSection] = useState<AnnexureKey>('paymentTerms');
  const annex = annexureOf(terms);
  const meta = ANNEXURE_SECTIONS.find((s) => s.key === section)!;
  const list = annex[section];
  const changed = Array.isArray(terms.annexure?.[section]);
  const changedCount = ANNEXURE_SECTIONS.filter((s) => Array.isArray(terms.annexure?.[s.key])).length;

  const setList = (next: AnnexClause[] | undefined) => {
    const annexure = { ...(terms.annexure || {}) };
    if (next) annexure[section] = next; else delete annexure[section];
    onChange({ ...terms, annexure });
  };
  const edit = (i: number, text: string) => setList(list.map((c, j) => (j === i ? { ...c, text } : c)));
  const remove = (i: number) => setList(list.filter((_, j) => j !== i));
  const add = () => setList([...list, { id: newClauseId(section), text: '' }]);

  return (
    <Panel
      icon={FileText}
      title="Annexure A"
      badge={changedCount > 0 ? <Chip tone="brand">{changedCount} changed</Chip> : undefined}
      blurb="The Commercial Terms & Conditions at the end of every proposal, and how long a proposal holds. Changes reach every proposal not yet sent; a sent one stays as it went."
      foot={<>Clauses can use {ANNEXURE_TOKENS.map((t, i) => <React.Fragment key={t}>{i ? ', ' : ''}<span className="font-semibold text-slate-700">{`{{${t}}}`}</span></React.Fragment>)}. The warranty is written from Warranty periods above, and the exclusions from each project&rsquo;s BOQ.</>}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="annex-validity" className={`${LABEL} block mb-1.5`}>Proposal valid for (days)</label>
          <input
            id="annex-validity"
            type="number"
            min={1}
            value={terms.proposalValidityDays ?? DEFAULT_VALIDITY_DAYS}
            onChange={(e) => onChange({ ...terms, proposalValidityDays: Math.max(1, Math.round(Number(e.target.value) || 0)) || DEFAULT_VALIDITY_DAYS })}
            className={INPUT}
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            From the day the proposal is issued. Clause 11 states it: {validityDaysOf(terms)} days.
          </p>
        </div>
        <div>
          <label htmlFor="annex-civil-days" className={`${LABEL} block mb-1.5`}>Civil work adds (working days)</label>
          <input
            id="annex-civil-days"
            type="number"
            min={0}
            value={civilDaysOf(terms)}
            onChange={(e) => onChange({ ...terms, civilWorkingDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            className={INPUT}
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            On a proposal&rsquo;s timeline when the project has no Timeline yet: bathrooms rebuilt and floors relaid before carpentry.
          </p>
        </div>
        <div>
          <label htmlFor="annex-section" className={`${LABEL} block mb-1.5`}>Clauses</label>
          <select id="annex-section" value={section} onChange={(e) => setSection(e.target.value as AnnexureKey)} className={INPUT}>
            {ANNEXURE_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.title}{Array.isArray(terms.annexure?.[s.key]) ? ' · changed' : ''}</option>
            ))}
          </select>
          {meta.note && <p className="text-[11px] text-slate-500 mt-1.5">{meta.note}</p>}
        </div>
      </div>

      <div key={section} className="mt-4 rounded-xl border border-slate-200 divide-y divide-slate-100 hud-swap">
        {list.length === 0 && (
          <p className="px-4 py-3 text-xs text-slate-500">No clauses in this list. It prints nothing.</p>
        )}
        {list.map((clause, i) => (
          <div key={clause.id} className="px-4 py-3 flex items-start gap-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="text-xs font-bold text-slate-400 tabular-nums pt-2 w-5 text-right shrink-0">{i + 1}</span>
            <textarea
              aria-label={`${meta.title}, clause ${i + 1}`}
              value={clause.text}
              onChange={(e) => edit(i, e.target.value)}
              rows={2}
              className={`${INPUT} resize-y`}
            />
            <Button variant="quiet" size="sm" icon={Trash2} onClick={() => remove(i)} title="Remove this clause" aria-label={`Remove clause ${i + 1}`} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={Plus} onClick={add}>Add a clause</Button>
        {changed && (
          <Button size="sm" variant="quiet" icon={RotateCcw} onClick={() => setList(undefined)}>
            Use standard wording ({ANNEXURE_DEFAULTS[section].length} clauses)
          </Button>
        )}
      </div>
    </Panel>
  );
}
