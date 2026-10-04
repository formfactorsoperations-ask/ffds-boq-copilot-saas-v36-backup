import React from 'react';
import { ClientTotalsOptions, clientTotals, execGstLabel } from '../../lib/scopeTotals';

/*
  What the client's totals show, chosen per issue: GST on execution, the design
  fee, GST on the design fee. Previewed live with the real figures, so the
  studio sees exactly the lines the Excel, the email and the portal will carry.
*/

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

interface Props {
  value: ClientTotalsOptions;
  onChange: (v: ClientTotalsOptions) => void;
  before: number | null;
  after: number;
}

export default function ClientTotalsPicker({ value, onChange, before, after }: Props) {
  const set = (patch: Partial<ClientTotalsOptions>) => onChange({ ...value, ...patch });
  const rows = clientTotals(before ?? after, after, value);
  const revision = before !== null;
  const box = (checked: boolean, label: React.ReactNode, onToggle: (v: boolean) => void, disabled = false) => (
    <label className={`flex items-center gap-2 text-[12.5px] ${disabled ? 'text-slate-400' : 'text-slate-700 cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-[#3D52A0]" />
      {label}
    </label>
  );
  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">What the client's total shows</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {box(value.execGst, execGstLabel(value), (v) => set({ execGst: v }))}
        {box(value.designFee, <>Design fee {value.designFeeValue > 0 ? `(${inr(value.designFeeValue)})` : '(none recorded)'}</>, (v) => set({ designFee: v, designGst: v ? value.designGst : false }), value.designFeeValue <= 0)}
        {box(value.designGst, `GST on the design fee (${value.gstRate}%)`, (v) => set({ designGst: v }), !value.designFee)}
        <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
          GST rate
          <input type="number" min={0} max={28} step={0.5} value={value.gstRate}
            onChange={(e) => set({ gstRate: Math.max(0, Math.min(28, Number(e.target.value) || 0)) })}
            className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-right tabular-nums" />%
        </label>
      </div>
      <table className="w-full text-[12.5px] tabular-nums">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-slate-400">
            <th className="text-left font-bold py-1"></th>
            {revision && <th className="text-right font-bold py-1">Signed</th>}
            <th className="text-right font-bold py-1">{revision ? 'Revised' : 'Amount'}</th>
            {revision && <th className="text-right font-bold py-1">Change</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key} className={r.key === 'total' ? 'font-bold text-slate-900' : 'text-slate-600'}>
              <td className="py-1.5">{r.label}</td>
              {revision && <td className="py-1.5 text-right">{inr(r.before)}</td>}
              <td className="py-1.5 text-right">{inr(r.after)}</td>
              {revision && <td className="py-1.5 text-right">{r.change >= 0 ? '+' : '−'}{inr(Math.abs(r.change))}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
