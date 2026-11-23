import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Check } from '@/lib/lucide-shim';
import { Button, Segmented, LABEL, INPUT } from '../ui/kit';
import DateField from '../ui/DateField';
import { formatCurrency } from '../../lib/utils';
import { issuesTotal, type DisputeAmounts, type DisputeDraft, type DisputeIssue, type ProjectDispute } from '../../lib/disputes';
import '../projectHeader/projectHeader.css';

/*
  Raise or edit a dispute (DESIGN.md → "Modals"; built like AssignProjectsModal).

  What is in dispute, said the way a client says it: the unpaid amount by
  head, and the items contested, each against its BOQ line with what was
  billed and what they want taken off.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const n = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));
const blank = (): DisputeIssue => ({ id: `iss_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: '', ref: '', billed: 0, claimed: 0 });

export const DisputeModal: React.FC<{
  projectName: string;
  /** Unpaid by head as Money has it now. */
  outstanding: DisputeAmounts;
  /** Set when editing a dispute already raised. */
  existing?: ProjectDispute | null;
  onClose: () => void;
  onSave: (d: DisputeDraft) => void;
}> = ({ projectName, outstanding, existing, onClose, onSave }) => {
  const [title, setTitle] = useState(existing?.title || '');
  const [summary, setSummary] = useState(existing?.summary || '');
  const [raisedBy, setRaisedBy] = useState<'client' | 'studio'>(existing?.raisedBy || 'client');
  const [openedOn, setOpenedOn] = useState(existing?.openedOn || today());
  const [claimed, setClaimed] = useState<DisputeAmounts>(existing?.claimed || outstanding);
  const [workStopped, setWorkStopped] = useState(!!existing?.workStopped);
  const [issues, setIssues] = useState<DisputeIssue[]>(existing?.issues?.length ? existing.issues : [blank()]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const patch = (id: string, p: Partial<DisputeIssue>) => setIssues((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const totals = issuesTotal({ issues: issues.filter((i) => i.title.trim()) });
  const inDispute = claimed.execution + claimed.design;
  const ok = title.trim().length >= 3 && !!openedOn;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={existing ? 'Edit dispute' : 'Raise a dispute'}
        className="relative phd-pop w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{projectName || 'Project'}</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5">{existing ? 'Edit dispute' : 'Raise a dispute'}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">For a payment the client is holding back over the work or the bill. The project keeps its stage; the dispute is tracked beside it until it is settled.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="block min-w-0"><span className={LABEL}>What is it about?</span>
              <input className={`${INPUT} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: kitchen and wardrobe not built to the drawings" /></label>
            <div><p className={LABEL}>Raised by</p>
              <div className="mt-1.5"><Segmented label="Raised by" size="sm" value={raisedBy} onChange={setRaisedBy} options={[{ id: 'client', label: 'Client' }, { id: 'studio', label: 'Studio' }]} /></div></div>
            <label className="block"><span className={LABEL}>Raised on</span>
              <div className="mt-1.5"><DateField value={openedOn} onChange={setOpenedOn} /></div></label>
          </div>
          <label className="block"><span className={LABEL}>What happened (optional)</span>
            <textarea className={`${INPUT} mt-1.5 min-h-[64px]`} value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="For example: client has moved in and says five items differ from the approved drawings. Wants deductions before paying the final bill." /></label>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <label><span className={LABEL}>Execution unpaid</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">₹<input type="number" min={0} step={100} className={`${INPUT} w-36 text-right tabular-nums`} value={claimed.execution ? String(claimed.execution) : ''} placeholder="0" onChange={(e) => setClaimed((c) => ({ ...c, execution: n(e.target.value) }))} /></span></label>
              <label><span className={LABEL}>Design fee unpaid</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">₹<input type="number" min={0} step={100} className={`${INPUT} w-36 text-right tabular-nums`} value={claimed.design ? String(claimed.design) : ''} placeholder="0" onChange={(e) => setClaimed((c) => ({ ...c, design: n(e.target.value) }))} /></span></label>
              <p className="flex-1 min-w-[180px] text-right text-sm text-slate-600">In dispute <b className="block text-xl font-black text-slate-800 tabular-nums">{money(inDispute)}</b></p>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Filled from what is unpaid on Money ({money(outstanding.execution)} execution, {money(outstanding.design)} design). Change it if the bill in dispute is different.</p>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" className="accent-[#3D52A0]" checked={workStopped} onChange={(e) => setWorkStopped(e.target.checked)} />
              The client has stopped further work on site
            </label>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <p className={LABEL}>Items in dispute</p>
              <p className="text-[11px] text-slate-500 tabular-nums">{totals.claimed > 0 ? `Client wants ${money(totals.claimed)} off ${money(totals.billed)} billed` : 'Optional: add them as the client lists them'}</p>
            </div>
            <div className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100">
              {issues.map((i, k) => (
                <div key={i.id} className="hud-row-in grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_7rem_7rem_auto] items-center gap-2 px-3 py-2" style={{ animationDelay: `${Math.min(k, 6) * 30}ms` }}>
                  <input aria-label="Item" className={INPUT} value={i.title} onChange={(e) => patch(i.id, { title: e.target.value })} placeholder="For example: kitchen loft built 17 in. deep, drawn 21 in." />
                  <input aria-label="BOQ line" className={INPUT} value={i.ref || ''} onChange={(e) => patch(i.id, { ref: e.target.value })} placeholder="BOQ line, e.g. 12 Kitchen loft" />
                  <input aria-label="Billed" type="number" min={0} step={100} className={`${INPUT} w-28 text-right tabular-nums`} value={i.billed ? String(i.billed) : ''} placeholder="Billed" onChange={(e) => patch(i.id, { billed: n(e.target.value) })} />
                  <input aria-label="Deduction asked" type="number" min={0} step={100} className={`${INPUT} w-28 text-right tabular-nums`} value={i.claimed ? String(i.claimed) : ''} placeholder="Asked off" onChange={(e) => patch(i.id, { claimed: n(e.target.value) })} />
                  <button type="button" aria-label="Remove item" onClick={() => setIssues((list) => (list.length > 1 ? list.filter((x) => x.id !== i.id) : [blank()]))} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-2"><Button size="sm" variant="quiet" icon={Plus} onClick={() => setIssues((list) => [...list, blank()])}>Add an item</Button></div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <p className="flex-1 min-w-[200px] text-[11px] text-slate-500">{ok ? 'Nothing changes on the invoices until the dispute is settled.' : 'Say what the dispute is about.'}</p>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!ok} onClick={() => onSave({ title, summary, raisedBy, openedOn, claimed, workStopped, issues })}>{existing ? 'Save changes' : 'Raise dispute'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DisputeModal;
