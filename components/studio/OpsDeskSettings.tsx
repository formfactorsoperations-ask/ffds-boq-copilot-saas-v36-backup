import React, { useState } from 'react';
import { opsSettingsOf, escalationRecipientsOf, type OpsSettings } from '../../lib/opsDesk';
import { runDailyCheckNow } from '../../services/opsDeskService';

/*
  Studio settings → Ops Desk: when a payment counts as late, who hears of an
  escalation, and when the daily check raises one by itself (lib/opsDesk).
  Saved with the rest of the studio record by the settings screen.
*/
export default function OpsDeskSettings({ org, team, canEdit, onChange }: {
  org: any;
  team: { email?: string; name?: string; role?: string; roles?: string[] }[];
  canEdit: boolean;
  onChange: (next: OpsSettings) => void;
}) {
  const s = opsSettingsOf(org);
  const fallback = escalationRecipientsOf({ team });
  const chosen = s.escalationRecipients;
  const people = team.filter((m) => m?.email && m.role !== 'Client');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);

  const set = (patch: Partial<OpsSettings>) => onChange({ ...s, ...patch });
  const toggle = (email: string) => {
    const base = chosen.length ? chosen : fallback;
    set({ escalationRecipients: base.includes(email) ? base.filter((e) => e !== email) : [...base, email] });
  };
  const num = 'w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13.5px] tabular-nums disabled:bg-slate-50';

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-700">Payment is late after</span>
          <span className="flex items-center gap-2"><input type="number" min={0} max={90} className={num} disabled={!canEdit} value={s.paymentDueDays}
            onChange={(e) => set({ paymentDueDays: Number(e.target.value) })} /><span className="text-[13px] text-slate-500">days from the invoice</span></span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-700">Escalate by itself after</span>
          <span className="flex items-center gap-2"><input type="number" min={1} max={10} className={num} disabled={!canEdit} value={s.escalateAfterReminders}
            onChange={(e) => set({ escalateAfterReminders: Number(e.target.value) })} /><span className="text-[13px] text-slate-500">unanswered reminders</span></span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-700">…and at least</span>
          <span className="flex items-center gap-2"><input type="number" min={1} max={60} className={num} disabled={!canEdit} value={s.escalateAfterDays}
            onChange={(e) => set({ escalateAfterDays: Number(e.target.value) })} /><span className="text-[13px] text-slate-500">days since the first</span></span>
        </label>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-700">Who decides escalations</p>
        <p className="text-[12.5px] text-slate-500 mt-0.5 mb-2">
          Each gets an email when one is raised and decides it on the Ops Desk. {chosen.length ? '' : 'Nobody chosen yet, so it goes to every Owner and Admin on the team.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {people.map((m) => {
            const email = String(m.email).trim().toLowerCase();
            const on = (chosen.length ? chosen : fallback).includes(email);
            return (
              <button key={email} type="button" disabled={!canEdit} onClick={() => toggle(email)} aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold ${on ? 'border-[#3D52A0] bg-[#3D52A0] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}>
                {on ? '✓ ' : '+ '}{m.name || email}
              </button>
            );
          })}
        </div>
        <p className="text-[11.5px] text-slate-500 mt-2">Only an Owner, Admin or Ops Director can record the decision, whoever is emailed.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">The daily check</p>
          <p className="text-xs text-slate-500">Runs every morning at 9. It raises an escalation for each payment or decision with enough unanswered reminders.</p>
          {checked && <p className="text-xs font-semibold text-slate-700 mt-1">{checked}</p>}
        </div>
        <button type="button" disabled={checking || !canEdit}
          onClick={async () => {
            setChecking(true);
            setChecked(null);
            try {
              const n = await runDailyCheckNow();
              setChecked(n ? `Raised ${n} escalation${n === 1 ? '' : 's'}.` : 'Nothing needed escalating.');
            } catch (e: any) {
              setChecked(e?.message || 'The check did not run. It may not be deployed yet.');
            } finally {
              setChecking(false);
            }
          }}
          className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          {checking ? 'Checking…' : 'Run it now'}
        </button>
      </div>
    </div>
  );
}
