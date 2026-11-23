import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Check } from '@/lib/lucide-shim';
import { Button, Chip, Segmented, LABEL, INPUT } from '../ui/kit';
import DateField from '../ui/DateField';
import { formatCurrency } from '../../lib/utils';
import {
  TERMINATION_REASONS, SETTLEMENT_BASES, computeSettlement, defaultDraft, settlementLine,
  type SettlementDraft, type SettlementInputs, type TerminationReason, type TerminationSettlement, type ProjectTermination,
} from '../../lib/termination';
import '../projectHeader/projectHeader.css';

/*
  Terminate a project (DESIGN.md → "Modals"; built like AssignProjectsModal).

  One window for the whole decision: why it is ending, what the studio keeps
  of the money, and what follows from that. The same window changes the
  settlement afterwards (`existing`), where the reason and date are fixed.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface TerminatePayload {
  reason: TerminationReason;
  note: string;
  effectiveOn: string;
  settlement: TerminationSettlement;
}

export const TerminateProjectModal: React.FC<{
  projectName: string;
  inputs: SettlementInputs;
  /** Portal logins that will lose this project. */
  portalLogins: number;
  /** Set when changing the settlement of a project already terminated. */
  existing?: ProjectTermination | null;
  onClose: () => void;
  onConfirm: (p: TerminatePayload) => Promise<void> | void;
}> = ({ projectName, inputs, portalLogins, existing, onClose, onConfirm }) => {
  const revising = !!existing;
  const [reason, setReason] = useState<TerminationReason | null>(existing?.reason ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [effectiveOn, setEffectiveOn] = useState(existing?.effectiveOn || today());
  const [draft, setDraft] = useState<SettlementDraft>(() => existing
    ? { basis: existing.settlement.basis, designDonePct: existing.settlement.designDonePct, executionDonePct: existing.settlement.executionDonePct, charges: existing.settlement.charges, chargesNote: existing.settlement.chargesNote, customAmount: existing.settlement.customAmount ?? existing.settlement.entitled }
    : defaultDraft(inputs));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const settlement = useMemo(() => computeSettlement(inputs, draft), [inputs, draft]);
  const line = settlementLine(settlement);
  const set = (patch: Partial<SettlementDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const numberOf = (v: string) => (v === '' ? 0 : Number(v) || 0);

  const noteNeeded = reason === 'other' && note.trim().length < 3;
  const ok = !!reason && !!effectiveOn && !noteNeeded && !busy;
  const hint = !reason ? 'Choose why the project is ending.'
    : noteNeeded ? 'Say what happened in the note.'
      : !effectiveOn ? 'Set the date it ends.'
        : revising ? 'Ready to save.' : 'Ready. This can be undone from Money.';

  const confirm = async () => {
    if (!ok || !reason) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason, note: note.trim(), effectiveOn, settlement });
    } catch (e: any) {
      setError(e?.message || 'That did not go through. Try again.');
      setBusy(false);
    }
  };

  const track = (label: string, gross: number, key: 'designDonePct' | 'executionDonePct', kept: number) => (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500 tabular-nums">Contract {money(gross)} with GST</p>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
        <input type="number" min={0} max={100} step={1} aria-label={`${label}: share of work done`}
          className={`${INPUT} w-20 text-right tabular-nums`} value={String(draft[key])}
          onChange={(e) => set({ [key]: Math.min(100, Math.max(0, numberOf(e.target.value))) } as Partial<SettlementDraft>)} />
        % done
      </label>
      <p className="w-28 text-right text-sm font-bold text-slate-800 tabular-nums">{money(kept)}</p>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <div role="dialog" aria-modal="true" aria-label={revising ? 'Change the settlement' : 'Terminate project'}
        className="relative phd-pop w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{projectName || 'Project'}</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5">{revising ? 'Change the settlement' : 'Terminate project'}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              {revising
                ? 'Correct what the studio keeps. The refund or balance is worked out again from it.'
                : 'For a project that ends before it is finished. Say why, then settle the money: what the studio keeps for the work done, and what goes back or is still owed.'}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="space-y-4 min-w-0">
            <div>
              <p className={LABEL}>Why is it ending?</p>
              <div role="radiogroup" aria-label="Reason" className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100">
                {TERMINATION_REASONS.map((r, i) => {
                  const on = reason === r.id;
                  return (
                    <button key={r.id} type="button" role="radio" aria-checked={on} disabled={revising} onClick={() => setReason(r.id)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className={`hud-row-in w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors first:rounded-t-xl last:rounded-b-xl disabled:cursor-default ${on ? 'bg-[#3D52A0]/5' : revising ? '' : 'hover:bg-slate-50'}`}>
                      <span className={`mt-0.5 w-4 h-4 rounded-full border grid place-items-center shrink-0 ${on ? 'border-[#3D52A0] bg-[#3D52A0] text-white' : 'border-slate-300'}`}>{on && <Check className="w-3 h-3" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">{r.label}<Chip tone="slate">{r.by === 'client' ? 'By the client' : 'By the studio'}</Chip></span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{r.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block"><span className={LABEL}>It ends on</span>
              <div className="mt-1.5"><DateField value={effectiveOn} onChange={setEffectiveOn} disabled={revising} /></div>
            </label>
            <label className="block"><span className={LABEL}>Note {reason === 'other' ? '' : '(optional)'}</span>
              <textarea className={`${INPUT} mt-1.5 min-h-[76px]`} value={note} disabled={revising} onChange={(e) => setNote(e.target.value)}
                placeholder="For example: agreement sent on 2 Nov, two reminders, no reply. Agreed on a call with the client." />
            </label>
          </div>

          <div className="space-y-4 min-w-0">
            <div>
              <p className={LABEL}>What does the studio keep?</p>
              <div className="mt-1.5"><Segmented label="Settlement basis" size="sm" value={draft.basis} onChange={(basis) => set({ basis })} options={SETTLEMENT_BASES.map((b) => ({ id: b.id, label: b.label }))} /></div>
              <p className="text-[11px] text-slate-500 mt-1.5">{SETTLEMENT_BASES.find((b) => b.id === draft.basis)?.blurb}</p>
            </div>

            {draft.basis === 'prorata' && (
              <div className="hud-swap rounded-xl border border-slate-200 px-4 divide-y divide-slate-100">
                {track('Design fee', inputs.designGross, 'designDonePct', settlement.designKept)}
                {inputs.executionGross > 0 && track('Execution', inputs.executionGross, 'executionDonePct', settlement.executionKept)}
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5">
                  <label className="min-w-0">
                    <span className="text-sm font-semibold text-slate-800">Other charges to recover</span>
                    <input className={`${INPUT} mt-1.5`} value={draft.chargesNote || ''} onChange={(e) => set({ chargesNote: e.target.value })} placeholder="For example: site survey, material already ordered" />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 self-end">₹
                    <input type="number" min={0} step={100} aria-label="Other charges, GST included" className={`${INPUT} w-32 text-right tabular-nums`}
                      value={draft.charges ? String(draft.charges) : ''} onChange={(e) => set({ charges: Math.max(0, numberOf(e.target.value)) })} placeholder="0" />
                  </label>
                </div>
              </div>
            )}
            {draft.basis === 'custom' && (
              <label className="hud-swap block rounded-xl border border-slate-200 px-4 py-3">
                <span className="text-sm font-semibold text-slate-800">The studio keeps</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">₹
                  <input type="number" min={0} step={100} aria-label="Amount the studio keeps, GST included" className={`${INPUT} w-40 text-right tabular-nums`}
                    value={draft.customAmount != null ? String(draft.customAmount) : ''} onChange={(e) => set({ customAmount: Math.max(0, numberOf(e.target.value)) })} placeholder="0" />
                  GST included
                </span>
              </label>
            )}

            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5 text-sm">
              <p className="flex justify-between gap-3 text-slate-600"><span>Studio keeps</span><b className="text-slate-800 tabular-nums">{money(settlement.entitled)}</b></p>
              <p className="flex justify-between gap-3 text-slate-600"><span>Collected so far</span><b className="text-slate-800 tabular-nums">{money(settlement.collected)}</b></p>
              <p className="flex justify-between items-center gap-3 pt-2 border-t border-slate-200">
                <span className="flex items-center gap-2 font-bold text-slate-800">
                  {line.kind === 'refund' ? 'Refund due to the client' : line.kind === 'balance' ? 'Balance due from the client' : 'Nothing to refund, nothing owed'}
                  <Chip tone={line.kind === 'refund' ? 'warn' : line.kind === 'balance' ? 'brand' : 'good'}>{line.kind === 'refund' ? 'Studio pays' : line.kind === 'balance' ? 'Client pays' : 'Even'}</Chip>
                </span>
                <b className="text-xl font-black text-slate-800 tabular-nums">{money(line.amount)}</b>
              </p>
            </div>

            <ul className="text-xs text-slate-600 space-y-1.5">
              {!revising && <li className="flex gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /><span>The client portal closes{portalLogins > 0 ? ` and this project comes off ${portalLogins} client login${portalLogins === 1 ? '' : 's'}` : ''}. Nothing more can be sent to it.</span></li>}
              {settlement.invoicedUnpaid > 0 && <li className="flex gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /><span>Invoices of {money(settlement.invoicedUnpaid)} are raised and unpaid. The settlement replaces them; cancel them in your accounts.</span></li>}
              <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-[#3D52A0] shrink-0 mt-0.5" /><span>Reports count {money(settlement.entitled)} for this project in place of the full contract. Money already collected stays in the months it came in{line.kind === 'refund' ? ', and the refund is taken off on the day it is paid' : ''}.</span></li>
              {!revising && <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-[#3D52A0] shrink-0 mt-0.5" /><span>The project is filed with closed projects, marked Terminated, and the decision is kept in History.</span></li>}
            </ul>
            {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <p className="flex-1 min-w-[200px] text-[11px] text-slate-500">{hint}</p>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          {revising
            ? <Button variant="primary" icon={Check} disabled={!ok} onClick={confirm}>{busy ? 'Saving…' : 'Save settlement'}</Button>
            : <Button variant="danger" disabled={!ok} onClick={confirm}>{busy ? 'Terminating…' : 'Terminate project'}</Button>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TerminateProjectModal;
