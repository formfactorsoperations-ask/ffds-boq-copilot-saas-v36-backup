import React, { useEffect, useState } from 'react';
import { Trash2 } from '@/lib/lucide-shim';
import {
  DEFAULT_REVISION_OFFER_NAME, RevisionOffer, RevisionOfferBases, describeRevisionOffer, revisionOfferAmount,
} from '../../lib/revisionOffer';

/*
  The discount given in a scope revision (lib/revisionOffer): what it is, how
  much, and what it comes off — the new items the revision adds (the default)
  or the whole revised BOQ. Revision Studio's rail and Money & Offers both draw
  it, each inside its own card, and write the same record. Commits on blur or
  Enter, so typing does not save every keystroke.
*/

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';

interface Props {
  /** The revision's number, for the labels. */
  number: number;
  offer: RevisionOffer | null | undefined;
  bases: RevisionOfferBases;
  /** A draft takes changes; an issued revision shows what it went out with. */
  editable: boolean;
  onChange: (offer: RevisionOffer | null) => void;
  /** The proposal's discount on execution, as the client agreed it: shown as staying. */
  proposalOff?: number;
  /** Prefix for the inputs' ids, so two copies on one page do not clash. */
  idPrefix?: string;
}

export default function RevisionOfferFields({ number, offer, bases, editable, onChange, proposalOff = 0, idPrefix = 'rof' }: Props) {
  const [name, setName] = useState(offer?.name || DEFAULT_REVISION_OFFER_NAME);
  const [value, setValue] = useState(offer ? String(offer.value || '') : '');
  useEffect(() => { setName(offer?.name || DEFAULT_REVISION_OFFER_NAME); setValue(offer ? String(offer.value || '') : ''); }, [offer?.name, offer?.value]);

  const amount = revisionOfferAmount(offer, bases);
  /* The top-up choice: the percentage typed, the total it comes to, and what is already given. */
  const given = Math.max(0, Number(bases.given) || 0);
  const topupPct = offer && offer.type === 'percentage' && offer.value > 0 ? +(+offer.value).toFixed(2) : 'X';
  const topupTarget = typeof topupPct === 'number' ? Math.round(bases.whole * (topupPct / 100)) : 0;
  const set = (patch: Partial<RevisionOffer>) => onChange({ name: DEFAULT_REVISION_OFFER_NAME, on: 'added', type: 'percentage', value: 0, ...(offer || {}), ...patch });
  const commitValue = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) { setValue(offer ? String(offer.value || '') : ''); return; }
    const capped = offer?.type === 'fixed' ? n : Math.min(100, n);
    if (capped !== (offer?.value || 0)) set({ value: capped });
  };
  const commitName = () => {
    const t = name.trim() || DEFAULT_REVISION_OFFER_NAME;
    if (t !== offer?.name) set({ name: t });
  };
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); };

  const proposalLine = proposalOff > 0 && (
    <p className="text-xs text-slate-500">The proposal’s discount stays as agreed: <b className="text-slate-700 tabular-nums">−{inr(proposalOff)}</b>.</p>
  );

  if (!offer) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">
          {editable
            ? `No discount on Scope Revision ${number}. One given here comes off the revised BOQ only, on its own line, and the payment schedule takes it off with the rest.`
            : `Scope Revision ${number} carries no discount of its own.`}
        </p>
        {proposalLine}
        {editable && (
          <button type="button" onClick={() => onChange({ name: DEFAULT_REVISION_OFFER_NAME, on: 'added', type: 'percentage', value: 0 })}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
            Add a discount
          </button>
        )}
      </div>
    );
  }

  if (!editable) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-800 min-w-0">{offer.name}</span>
          <span className="font-black text-emerald-700 tabular-nums whitespace-nowrap">−{inr(amount)}</span>
        </div>
        <p className="text-xs text-slate-500">{describeRevisionOffer(offer)}</p>
        {proposalLine}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={label} htmlFor={`${idPrefix}-name`}>What it is</label>
        <input id={`${idPrefix}-name`} className={field} value={name} onChange={e => setName(e.target.value)} onBlur={commitName} onKeyDown={enter} />
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-val`}>Amount</label>
        <div className="flex gap-2">
          <input id={`${idPrefix}-val`} type="number" min={0} step="any" className={field} value={value} placeholder="0"
            onChange={e => setValue(e.target.value)} onBlur={commitValue} onKeyDown={enter} />
          <select aria-label="Percent or rupees" className={`${field} w-20`} value={offer.type}
            onChange={e => set({ type: e.target.value as RevisionOffer['type'], value: e.target.value === 'percentage' ? Math.min(100, offer.value || 0) : offer.value || 0 })}>
            <option value="percentage">%</option>
            {/* A top-up is a percentage of the revised BOQ: it has no rupee form. */}
            <option value="fixed" disabled={offer.on === 'topup'}>₹</option>
          </select>
        </div>
      </div>
      <fieldset>
        <legend className={label}>Comes off</legend>
        <div className="space-y-1.5">
          {([
            ['added', 'The new items it adds', bases.added,
              (bases.inWholeRooms || 0) > 0 ? `${inr(bases.added - (bases.inWholeRooms || 0))} new lines + ${inr(bases.inWholeRooms || 0)} new in rooms compared as a whole` : ''],
            ['whole', 'The whole revised BOQ', bases.whole,
              proposalOff > 0 ? 'Includes the scope already agreed, which has its own discount' : ''],
            ['topup', `Bring the total discount to ${topupPct}% of the revised BOQ`, topupTarget,
              `${inr(topupTarget)} in all, less ${inr(given)} already given`],
          ] as const).map(([k, t, v, sub]) => (
            <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${offer.on === k ? 'border-[#3D52A0] bg-[#3D52A0]/5' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name={`${idPrefix}-on`} className="accent-[#3D52A0]" checked={offer.on === k}
                onChange={() => set(k === 'topup' ? { on: k, type: 'percentage', value: Math.min(100, offer.type === 'percentage' ? offer.value || 0 : 0) } : { on: k })} />
              <span className="flex-1 min-w-0 text-slate-700">{t}{sub && <span className="block text-[11px] text-slate-500">{sub}</span>}</span>
              <span className="tabular-nums text-xs text-slate-500">{inr(v)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600 space-y-1">
        <p>Worth <b className="text-emerald-700 tabular-nums">−{inr(amount)}</b>{amount > 0 ? ` · ${describeRevisionOffer(offer)}` : ''}</p>
        {offer.on === 'added' && bases.added <= 0 && <p className="text-amber-700">This revision adds no new items yet, so there is nothing for it to come off.</p>}
        {offer.on === 'topup' && (offer.value || 0) > 0 && amount <= 0 && (
          <p className="text-amber-700">The discount already given, {inr(given)}, is already {topupPct}% of the revised BOQ or more, so there is nothing to add.</p>
        )}
        {offer.on === 'whole' && proposalOff > 0 && amount > 0 && (
          <p className="text-amber-700">This also takes {offer.type === 'percentage' ? `${+(+offer.value).toFixed(2)}%` : 'it'} off the scope the client already agreed, on top of the proposal’s {inr(proposalOff)}. For a discount on what was added only, choose the new items.</p>
        )}
        <p>Off the revised side only, on its own line, so the client sees it as part of the change.</p>
      </div>
      {proposalLine}
      <button type="button" onClick={() => onChange(null)} className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer">
        <Trash2 className="w-3.5 h-3.5" /> Remove the discount
      </button>
    </div>
  );
}
