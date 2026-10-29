import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/lib/lucide-shim';
import { targetsOf, overheadsMonthly, type ReportTargets } from '../../../lib/reportTargets';
import { inr } from '../../../lib/ownerReports';
import '../../projectHeader/projectHeader.css';

/*
  Set targets: what the scorecard measures the studio against, the monthly
  overheads behind break-even, and how much one person carries. On the
  AssignProjectsModal pattern. Money is entered in lakh, the way the studio
  says it, and stored in rupees.
*/

const LAKH = 100000;
const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block';

type Draft = Record<string, string>;
const toDraft = (t: ReportTargets): Draft => ({
  bookingsMonthly: t.bookingsMonthly ? String(t.bookingsMonthly / LAKH) : '',
  collectionsMonthly: t.collectionsMonthly ? String(t.collectionsMonthly / LAKH) : '',
  perPersonMonthly: t.perPersonMonthly ? String(t.perPersonMonthly / LAKH) : '',
  winRatePct: String(t.winRatePct),
  onTimePct: String(t.onTimePct),
  pipelineMonths: String(t.pipelineMonths),
  salaries: t.overheads.salaries ? String(t.overheads.salaries / LAKH) : '',
  rent: t.overheads.rent ? String(t.overheads.rent / LAKH) : '',
  other: t.overheads.other ? String(t.overheads.other / LAKH) : '',
  projectsPerDesigner: String(t.projectsPerDesigner),
  sitesPerSupervisor: String(t.sitesPerSupervisor),
  leadsPerClientRelations: String(t.leadsPerClientRelations),
});
const lakh = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * LAKH));
const fromDraft = (d: Draft): ReportTargets => targetsOf({
  bookingsMonthly: lakh(d.bookingsMonthly),
  collectionsMonthly: lakh(d.collectionsMonthly),
  perPersonMonthly: lakh(d.perPersonMonthly),
  winRatePct: Number(d.winRatePct),
  onTimePct: Number(d.onTimePct),
  pipelineMonths: Number(d.pipelineMonths),
  overheads: { salaries: lakh(d.salaries) || 0, rent: lakh(d.rent) || 0, other: lakh(d.other) || 0 },
  projectsPerDesigner: Number(d.projectsPerDesigner),
  sitesPerSupervisor: Number(d.sitesPerSupervisor),
  leadsPerClientRelations: Number(d.leadsPerClientRelations),
});

const Field: React.FC<{ id: string; title: string; unit: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string }> = ({
  id, title, unit, value, onChange, placeholder, step = 'any',
}) => (
  <label className="block min-w-0" htmlFor={`target-${id}`}>
    <span className={label}>{title}</span>
    <span className="flex items-center gap-2">
      <input id={`target-${id}`} aria-label={`${title}, in ${unit}`} type="number" min={0} step={step} inputMode="decimal" className={input}
        value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>
    </span>
  </label>
);

const Section: React.FC<{ title: string; blurb: string; children: React.ReactNode; delay: number }> = ({ title, blurb, children, delay }) => (
  <div className="hud-row-in rounded-2xl border border-slate-200 p-4" style={{ animationDelay: `${delay}ms` }}>
    <div className="text-sm font-semibold text-slate-800">{title}</div>
    <p className="text-[11px] text-slate-500 mt-0.5">{blurb}</p>
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
  </div>
);

export default function TargetsModal({ targets, onClose, onSave }: {
  targets: ReportTargets;
  onClose: () => void;
  onSave: (t: ReportTargets) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(targets));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const next = fromDraft(d);
  const oh = overheadsMonthly(next);

  const save = async () => {
    setSaving(true); setError(null);
    try { await onSave(next); onClose(); }
    catch (e: any) { setError(e?.message || 'The targets could not be saved. Try again in a moment.'); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Set targets">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Set targets</p>
            <h3 className="font-bold text-slate-800 mt-1">What should the studio be measured against?</h3>
            <p className="text-xs text-slate-500 mt-1">Money in lakh, before GST. A target left empty is not shown on the scorecard.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <Section title="Money each month" blurb="Quarter and year figures are these times the months in them." delay={0}>
            <Field id="bookings" title="Sales booked" unit="lakh" value={d.bookingsMonthly} onChange={set('bookingsMonthly')} placeholder="50" />
            <Field id="collections" title="Cash received" unit="lakh" value={d.collectionsMonthly} onChange={set('collectionsMonthly')} placeholder="35" />
            <Field id="perPerson" title="Booked per person" unit="lakh" value={d.perPersonMonthly} onChange={set('perPersonMonthly')} placeholder="4" />
          </Section>
          <Section title="Rates" blurb="Win rate counts leads won or lost; on time counts handovers with a target date." delay={30}>
            <Field id="winRate" title="Win rate" unit="%" value={d.winRatePct} onChange={set('winRatePct')} step="1" />
            <Field id="onTime" title="On-time handovers" unit="%" value={d.onTimePct} onChange={set('onTimePct')} step="1" />
            <Field id="pipeline" title="Pipeline cover" unit="months" value={d.pipelineMonths} onChange={set('pipelineMonths')} step="0.5" />
          </Section>
          <Section title="Monthly overheads" blurb={oh > 0 ? `${inr(oh)} a month, for break-even and the studio's profit.` : 'For break-even and the studio\'s profit. Only the Owner, Admin and Ops Director see these.'} delay={60}>
            <Field id="salaries" title="Salaries" unit="lakh" value={d.salaries} onChange={set('salaries')} />
            <Field id="rent" title="Rent" unit="lakh" value={d.rent} onChange={set('rent')} />
            <Field id="other" title="Software and other" unit="lakh" value={d.other} onChange={set('other')} />
          </Section>
          <Section title="What one person carries" blurb="Live and signed projects for design and site; open leads for Client Relations, who coordinate every project." delay={90}>
            <Field id="designer" title="Per Designer" unit="projects" value={d.projectsPerDesigner} onChange={set('projectsPerDesigner')} step="1" />
            <Field id="supervisor" title="Per Site Supervisor" unit="sites" value={d.sitesPerSupervisor} onChange={set('sitesPerSupervisor')} step="1" />
            <Field id="clientRelations" title="Per Client Relations" unit="open leads" value={d.leadsPerClientRelations} onChange={set('leadsPerClientRelations')} step="1" />
          </Section>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <span className={`text-xs ${error ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
            {error || 'Only the Owner, Admin and Ops Director see these targets.'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50">
              {saving ? 'Saving…' : 'Save targets'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
