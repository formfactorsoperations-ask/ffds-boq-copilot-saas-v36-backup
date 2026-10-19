import React, { useState } from 'react';
import { opsSettingsOf, escalationRecipientsOf, type OpsSettings } from '../../lib/opsDesk';
import { runDailyCheckNow } from '../../services/opsDeskService';
import { Check, Plus } from '@/lib/lucide-shim';
import { Dot } from '../ui/HudBits';

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
  const num = 'w-24 px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
  const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Payment is late after</span>
          <span className="flex items-center gap-2"><input type="number" min={0} max={90} className={num} disabled={!canEdit} value={s.paymentDueDays}
            onChange={(e) => set({ paymentDueDays: Number(e.target.value) })} /><span className="text-xs text-slate-500">days from the invoice</span></span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Escalate by itself after</span>
          <span className="flex items-center gap-2"><input type="number" min={1} max={10} className={num} disabled={!canEdit} value={s.escalateAfterReminders}
            onChange={(e) => set({ escalateAfterReminders: Number(e.target.value) })} /><span className="text-xs text-slate-500">unanswered reminders</span></span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>…and at least</span>
          <span className="flex items-center gap-2"><input type="number" min={1} max={60} className={num} disabled={!canEdit} value={s.escalateAfterDays}
            onChange={(e) => set({ escalateAfterDays: Number(e.target.value) })} /><span className="text-xs text-slate-500">days since the first</span></span>
        </label>
      </div>

      <div>
        <p className={label}>Who decides escalations</p>
        <p className="text-xs text-slate-500 mt-1 mb-2">
          Each gets an email when one is raised and decides it on the Ops Desk. {chosen.length ? '' : 'Nobody chosen yet, so it goes to every Owner and Admin on the team.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {people.map((m) => {
            const email = String(m.email).trim().toLowerCase();
            const on = (chosen.length ? chosen : fallback).includes(email);
            return (
              <button key={email} type="button" disabled={!canEdit} onClick={() => toggle(email)} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors hud-row-in ${on ? 'border-[#3D52A0] bg-[#3D52A0] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-60`}>
                {on ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-slate-400" />}{m.name || email}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Only an Owner, Admin or Ops Director can record the decision, whoever is emailed.</p>
      </div>

      <label className="flex flex-col gap-1.5 max-w-xl">
        <span className={label}>Google review link</span>
        <input type="url" className={num.replace('w-24', 'w-full')} disabled={!canEdit} maxLength={300} placeholder="https://g.page/r/…/review"
          value={String(org?.opsDesk?.reviewLink ?? '')} onChange={(e) => set({ reviewLink: e.target.value.trim() })} />
        <span className="text-[11px] text-slate-500">Put in the message when Client Relations asks a happy client for a review. From your Google Business Profile → Ask for reviews.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">New minutes flow</p>
          <p className="text-xs text-slate-500">
            Client Relations writes the minutes, the Ops Director approves or returns them with notes on the lines, Client Relations sends them,
            and the client confirms or marks the line that is wrong. New minutes start this way when it is on; minutes already written open as before.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={s.newMinutes} aria-label="New minutes flow" disabled={!canEdit}
          onClick={() => set({ newMinutes: !s.newMinutes })}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors disabled:opacity-50 ${s.newMinutes ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
          <span className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: s.newMinutes ? 'translateX(20px)' : undefined }} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">The daily check</p>
          <p className="text-xs text-slate-500">Runs every morning at 9. It raises an escalation for each payment or decision with enough unanswered reminders.</p>
          {checking && <p className="flex items-center gap-2 text-xs text-slate-500 mt-1"><Dot tone="warn" live />Checking…</p>}
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
          className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">
          {checking ? 'Checking…' : 'Run it now'}
        </button>
      </div>
    </div>
  );
}
