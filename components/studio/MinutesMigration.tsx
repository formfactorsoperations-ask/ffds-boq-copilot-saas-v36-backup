import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, ArrowRight, AlertTriangle, Loader2, Check, Eye, Undo2 } from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { isMinutesLead, statusChip, fmtShortDay } from '../../lib/minutes';
import { SOURCE_LABEL, KEEP_DAYS, type MigrationCandidate, type MigrationPlan, type MigrationSource } from '../../lib/minutesMigration';
import { checkOlderMinutes, applyMigration, lastMigration, undoMigration, type MigrationRun } from '../../services/minutesMigrationService';
import { Chip, EYEBROW, btnPri, btnSec, btnSm } from '../minutes/MinutesBits';

/*
  STUDIO SETTINGS → MINUTES (mockup 12).

  Bring older minutes into the new format, once: check first (nothing
  changes), review what needs a look, then apply. An Owner, Admin or Ops
  Director runs it. Originals are kept for 90 days with an undo, refs stay
  as they are, and nothing is sent to clients (lib/minutesMigration.ts).
*/

const STATUS_MAP: [string, string][] = [
  ['Draft', 'draft'], ['Pending review', 'pending_review'], ['Finalised', 'finalised'],
  ['Shared', 'shared'], ['Acknowledged', 'acknowledged'], ['Correction requested', 'correction_requested'],
];

export default function MinutesMigration() {
  const { orgData, currentRole, currentRoles, currentUserAuth, teamMembers } = useOrg() as any;
  const roles: string[] = currentRoles?.length ? currentRoles : [currentRole];
  const lead = isMinutesLead(roles);
  const tenantId: string = orgData?.tenantId || '';
  const team: any[] = (orgData?.team || teamMembers || []) as any[];
  const email = String(currentUserAuth?.email || '').toLowerCase();
  const me = { email, name: team.find((t) => String(t?.email || '').toLowerCase() === email)?.name || currentUserAuth?.displayName || email };
  const reviewer = String(team.find((t) => [t?.role, ...(t?.roles || [])].includes('Ops Director'))?.name || '').split(' ')[0] || 'the Ops Director';

  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<number | null>(null);
  const [run, setRun] = useState<MigrationRun | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !lead) return;
    lastMigration(tenantId).then(setRun).catch(() => setRun(null));
  }, [tenantId, lead]);

  const check = async () => {
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      setPlan(await checkOlderMinutes(tenantId, team));
      setInclude(new Set());
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'You cannot read every project\'s minutes. Ask an Owner to run this.' : 'The check did not finish. Check your connection and try again.');
    } finally { setChecking(false); }
  };

  const ready = useMemo(() => (plan?.candidates || []).filter((c) => !c.issues.length), [plan]);
  const look = useMemo(() => (plan?.candidates || []).filter((c) => c.issues.length), [plan]);
  const chosen = useMemo(() => [...ready, ...look.filter((c) => include.has(c.key))], [ready, look, include]);
  const notesOnly = (plan?.candidates || []).filter((c) => c.notesOnly).length;

  const apply = async () => {
    setError(null);
    setApplying(0);
    try {
      const r = await applyMigration(tenantId, chosen, me, setApplying);
      setRun(r);
      setPlan(null);
      setMessage(`${r.done} minutes brought across${r.failed ? `; ${r.failed} could not be, and are as they were` : ''}.`);
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'Only an Owner, Admin or Ops Director can bring minutes across.' : 'That did not finish. Minutes already brought across stay so; check again to see the rest.');
    } finally { setApplying(null); }
  };

  const undo = async () => {
    if (!run) return;
    setUndoing(true);
    setError(null);
    try {
      const r = await undoMigration(tenantId, run.id);
      setRun({ ...run, state: 'undone', undoneAt: Date.now() });
      setMessage(`Undone: ${r.restored} minutes are as they were${r.failed ? `; ${r.failed} could not be put back` : ''}.`);
    } catch (e: any) {
      setError(e?.message || 'The undo did not finish. Try again.');
    } finally { setUndoing(false); }
  };

  if (!lead) {
    return <p className="text-sm text-slate-500">An Owner, Admin or Ops Director brings older minutes into the new format.</p>;
  }

  const stepOn = plan ? 1 : run?.state === 'applied' ? 2 : 0;
  const canUndo = run?.state === 'applied' && Date.now() < run.expiresAt;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4 hud-panel-in">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Bring older minutes into the new format</p>
            <p className="text-xs text-slate-500 mt-0.5">A check first; nothing changes until you apply it.</p>
          </div>
          <div className="flex items-center gap-1.5" aria-label="Steps">
            {['Check', 'Review', 'Apply'].map((s, i) => (
              <span key={s} className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${i === stepOn ? 'bg-[#3D52A0] text-white' : i < stepOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s}</span>
            ))}
          </div>
        </div>

        {!plan && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
            <p className="text-xs text-slate-600 flex-1 min-w-0">
              Looks through every project: minutes on projects, older project copies, notes inside site visits and the minutes history on the project.
            </p>
            <button type="button" className={btnPri} disabled={checking || !tenantId} onClick={check}>
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}{checking ? 'Checking…' : 'Check older minutes'}
            </button>
          </div>
        )}

        {plan && (
          <div className="hud-swap">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {([[plan.candidates.length, 'minutes found', 'slate'], [ready.length, 'ready to bring across', 'emerald'], [look.length, 'need a look', 'amber'], [notesOnly, 'old notes only', 'slate']] as [number, string, string][]).map(([n, l, t], i) => (
                <div key={l} className="rounded-xl border border-slate-200 px-4 py-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <p className={`text-2xl font-black tabular-nums ${t === 'emerald' ? 'text-emerald-700' : t === 'amber' ? 'text-amber-700' : 'text-slate-800'}`}>{n}</p>
                  <p className="text-xs text-slate-500">{l}</p>
                </div>
              ))}
            </div>
            {plan.alreadyNew > 0 && <p className="text-[11px] text-slate-500 mt-2">{plan.alreadyNew} minutes are already in the new format and are left as they are.</p>}

            <div className="grid gap-4 mt-4 grid-cols-1 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className={`${EYEBROW} mb-2`}>Where they were found</p>
                <div className="divide-y divide-slate-100 text-sm">
                  {(Object.keys(SOURCE_LABEL) as MigrationSource[]).map((s) => (
                    <div key={s} className="flex justify-between py-2"><span className="text-slate-700">{SOURCE_LABEL[s]}</span><span className="font-black text-slate-800 tabular-nums">{plan.bySource[s]}</span></div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className={`${EYEBROW} mb-2`}>How each status carries over</p>
                <div className="space-y-1.5 text-xs">
                  {STATUS_MAP.map(([label, st]) => {
                    const c = statusChip({ status: st as any }, reviewer);
                    return <div key={st} className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="w-28 sm:w-36 shrink-0 text-slate-600">{label}</span><ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" /><Chip tone={c.tone}>{c.label}</Chip></div>;
                  })}
                </div>
              </div>
            </div>

            {look.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 mt-4">
                <p className="text-sm font-bold text-amber-900 mb-1 inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{look.length} need a look before they come across</p>
                <p className="text-xs text-amber-800 mb-2">They are left out unless you bring them across as they are. You can also fix them on the project first and check again.</p>
                <div className="divide-y divide-amber-100 text-xs">
                  {look.map((c, i) => (
                    <div key={c.key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                      <span className="sm:w-56 shrink-0 font-semibold text-amber-900">{label(c)}</span>
                      <span className="flex-1 min-w-0 text-amber-800">{c.issues.map((x) => x.text).join(' · ')}</span>
                      <label className="inline-flex items-center gap-2 font-bold text-[#3D52A0] cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-[#3D52A0]" checked={include.has(c.key)}
                          onChange={(e) => setInclude((s) => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} />
                        Bring across as it is
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
              <p className="text-[11px] text-slate-500 flex-1 min-w-0">
                Originals are kept untouched for {KEEP_DAYS} days, with an undo. Nothing is sent to clients, and refs like MOM-2026-014 stay as they are.
              </p>
              <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSec} disabled={applying != null || checking} onClick={check}>
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Check again
              </button>
              <button type="button" className={btnPri} disabled={applying != null || !chosen.length} onClick={apply}>
                {applying != null ? <><Loader2 className="w-4 h-4 animate-spin" />{applying} of {chosen.length}</> : <><Check className="w-4 h-4" />Bring {chosen.length} across</>}
              </button>
              </div>
            </div>
          </div>
        )}

        {message && <p className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 hud-panel-in" role="status">{message}</p>}
        {error && <p className="mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
      </div>

      {run && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hud-panel-in">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">
              {run.state === 'undone' ? 'Last run undone' : `Last run: ${run.done} brought across`}
            </p>
            <p className="text-xs text-slate-500">
              By {run.byName || run.by}, {fmtShortDay(run.at)}.{' '}
              {run.state === 'undone' ? 'The minutes are as they were before it.'
                : canUndo ? `Undo puts every one back as it was, until ${fmtShortDay(run.expiresAt)}. Anything written on them since is lost.` : 'The originals are no longer kept.'}
            </p>
          </div>
          {canUndo && (
            <button type="button" className={btnSm} disabled={undoing} onClick={undo}>
              {undoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}Undo this run
            </button>
          )}
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 md:grid-cols-3 text-xs text-slate-700">
        {[
          ['They read the same', 'Lines keep their wording. Decisions, actions and notes become lines under one topic, “Discussion”. Nothing is rewritten by AI.'],
          ['Open actions carry on', 'Every open action shows in “From the last meeting” when the next minutes are written.'],
          ['Earlier approvals, marked', 'Minutes approved before are marked “Approved before the new process”, as no one recorded who approved them. Confirmed minutes stay confirmed.'],
        ].map(([t, d]) => <div key={t} className="rounded-xl border border-slate-200 px-3 py-3"><p className="font-bold text-slate-800 mb-1">{t}</p><p className="text-slate-600">{d}</p></div>)}
      </div>
    </div>
  );
}

function label(c: MigrationCandidate) {
  return `${c.momRef || c.title}${c.projectName ? ` · ${c.projectName}` : ''}`;
}
