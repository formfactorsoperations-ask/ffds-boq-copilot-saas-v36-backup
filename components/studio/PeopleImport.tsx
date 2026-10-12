import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, Check, RotateCcw, ChevronDown, Users, Clock3, CalendarDays, Sun } from '@/lib/lucide-shim';
import { peopleOf, policyOf, type Person, type Policy } from '../../lib/peopleDesk';
import { newBatchId, planImport, stamp, type ImportChoices, type ImportPlan, type Workbook } from '../../lib/peopleImport';
import { peopleImportCall, refreshPeople } from '../../services/peopleService';
import { useOrg } from '../../contexts/OrgContext';
import { Sheet, btnPri, btnSec, btnSm } from '../opsDesk/OpsDeskPanels';
import { CountUp, Dot } from '../ui/HudBits';

/*
  Studio settings → People → Bring over People Hub (lib/peopleImport.ts).

  The admin chooses the People Hub workbook they downloaded from Google
  Sheets. It is read in the browser and nothing is saved until they have
  seen the dry run: who matches whom, what comes over, what is left out and
  why, People Hub's balances next to what StudioDesk will count, and the
  questions only they can answer. Holidays and comp-off go into the settings
  draft, saved with the rest of the settings. Past imports can be undone.
*/

const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';
const CHUNK = 400;
const ARCHIVE_PART = 600_000;
const TABS = ['Team', 'Attendance', 'Leaves', 'Balances', 'Holidays'];
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

interface PastImport { id: string; status: 'running' | 'done' | 'undone'; startedAt: string; byName?: string; fileName?: string; written?: number; skipped?: number; removed?: number; kept?: number }

/** The workbook's tabs as rows of raw cells: Excel day numbers stay numbers, so dates read the same everywhere. */
async function readWorkbook(file: File): Promise<Workbook> {
  const XLSX: any = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const out: Workbook = {};
  for (const name of wb.SheetNames) out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  return out;
}

/** The rows of a tab in parts small enough to keep. */
function parts(rows: unknown[][]): string[] {
  const out: string[] = [];
  let part: unknown[][] = [];
  let size = 2;
  for (const r of rows) {
    const n = JSON.stringify(r).length + 1;
    if (part.length && size + n > ARCHIVE_PART) { out.push(JSON.stringify(part)); part = []; size = 2; }
    part.push(r);
    size += n;
  }
  if (part.length) out.push(JSON.stringify(part));
  return out;
}

export interface SettingsAdd { holidays: { date: string; name: string }[]; grants: { personId: string; fy: string; earned: number }[] }

export default function PeopleImport({ org, canEdit, onApply }: {
  org: any;
  canEdit: boolean;
  /** Put the holidays and comp-off the admin chose into the settings draft, in one change. */
  onApply: (add: SettingsAdd) => void;
}) {
  const studio = String((useOrg() as any)?.orgData?.tenantId || '');
  const fileRef = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<{ name: string; tabs: Workbook } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<PastImport[] | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const people = useMemo(() => peopleOf(org), [org]);
  const policy = useMemo(() => policyOf(org), [org]);

  const loadPast = async () => {
    if (!studio) return;
    try { setPast(((await peopleImportCall(studio, { action: 'list' })).imports || []) as PastImport[]); } catch { setPast([]); }
  };
  useEffect(() => { if (canEdit) loadPast(); }, [studio, canEdit]);

  const choose = async (file?: File | null) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      setBook({ name: file.name, tabs: await readWorkbook(file) });
    } catch {
      setError('That file could not be read. In Google Sheets choose File → Download → Microsoft Excel (.xlsx), then choose that file.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const undo = async (id: string) => {
    if (!window.confirm('Remove everything this import brought over? Days and requests changed on StudioDesk since are kept.')) return;
    setUndoing(id);
    setError(null);
    try {
      const r = await peopleImportCall(studio, { action: 'undo', batch: id });
      await Promise.all([loadPast(), refreshPeople()]);
      setError(null);
      window.alert(`Removed ${r.removed} record${r.removed === 1 ? '' : 's'}${r.kept ? `; kept ${r.kept} changed on StudioDesk since` : ''}.`);
    } catch (e: any) { setError(e.message); }
    setUndoing(null);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className={label}>Bring over People Hub</p>
          <p className="text-xs text-slate-500 mt-1">Attendance, leave and holidays from the People Hub workbook. You see everything before it is saved, and an import can be undone.</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><FileSpreadsheet className="w-5 h-5" /></span>
        <ol className="text-xs text-slate-600 flex-1 list-decimal pl-4 space-y-0.5">
          <li>Open the People Hub workbook in Google Sheets.</li>
          <li>Choose File → Download → Microsoft Excel (.xlsx).</li>
          <li>Choose that file here. It is read on this computer; nothing is saved yet.</li>
        </ol>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        <button type="button" className={btnPri} disabled={!canEdit || reading || !studio} onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4" />{reading ? 'Reading…' : 'Choose the workbook'}
        </button>
      </div>
      {!canEdit && <p className="text-[11px] text-slate-500">Only an Owner or Admin can import.</p>}
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      {past && past.length > 0 && (
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {past.map((p, i) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
              <Dot tone={p.status === 'done' ? 'ok' : p.status === 'undone' ? 'bad' : 'warn'} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.fileName || 'People Hub workbook'}</p>
                <p className="text-[11px] text-slate-500">{when(p.startedAt)}{p.byName ? ` · ${p.byName}` : ''} · {p.written || 0} saved{p.skipped ? `, ${p.skipped} left as they were` : ''}{p.status === 'undone' ? ` · undone, ${p.removed || 0} removed` : ''}</p>
              </div>
              <span className={`${chip} ${p.status === 'done' ? 'bg-emerald-100 text-emerald-700' : p.status === 'undone' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{p.status === 'done' ? 'Imported' : p.status === 'undone' ? 'Undone' : 'Not finished'}</span>
              {canEdit && p.status !== 'undone' && (
                <button type="button" className={btnSm} disabled={undoing === p.id} onClick={() => undo(p.id)}><RotateCcw className="w-3.5 h-3.5" />{undoing === p.id ? 'Undoing…' : 'Undo'}</button>
              )}
            </div>
          ))}
        </div>
      )}
      {book && (
        <ImportSheet
          studio={studio} fileName={book.name} tabs={book.tabs} people={people} policy={policy}
          onClose={() => setBook(null)}
          onDone={() => { loadPast(); refreshPeople(); }}
          onApply={onApply}
        />
      )}
    </section>
  );
}

/* ── The dry run, and saving it ──────────────────────────────────────────── */

function ImportSheet({ studio, fileName, tabs, people, policy, onClose, onDone, onApply }: {
  studio: string; fileName: string; tabs: Workbook; people: Person[]; policy: Policy;
  onClose: () => void; onDone: () => void; onApply: (add: SettingsAdd) => void;
}) {
  /* One import for this workbook, kept across a retry so it carries on rather than starting another. */
  const batchRef = useRef(newBatchId());
  const [choices, setChoices] = useState<ImportChoices>({});
  const plan: ImportPlan = useMemo(() => planImport(tabs, people, policy, choices), [tabs, people, policy, choices]);
  const [addHolidays, setAddHolidays] = useState(true);
  const [grantComp, setGrantComp] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ written: number; skipped: { id: string; why: string }[]; added: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = (kind: 'duplicate' | 'half' | 'name', id: string, value: string) => setChoices((c) => {
    if (kind === 'duplicate') return { ...c, keepRow: { ...c.keepRow, [id]: Number(value) } };
    if (kind === 'half') return { ...c, halfOf: { ...c.halfOf, [Number(id)]: value as 'First half' | 'Second half' } };
    return { ...c, nameTo: { ...c.nameTo, [id]: value } };
  });

  const total = plan.attendance.length + plan.requests.length;
  const matched = plan.people.filter((p) => p.personId).length;
  const disagree = plan.recon.filter((r) => !r.agrees);
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of plan.skipped) { const k = `${s.tab}: ${s.why.replace(/row \d+/i, 'another row').replace(/^Another row for .* was kept$/, 'Another row for that person and day was kept')}`; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [plan.skipped]);
  const busy = !!progress && !result;
  const cannot = plan.blocking > 0 || total === 0 || !studio;

  const save = async () => {
    setError(null);
    const batch = batchRef.current;
    const { attendance, requests } = stamp(planImport(tabs, people, policy, choices, batch), batch);
    const records = [...attendance.map((a) => ({ kind: 'attendance' as const, v: a })), ...requests.map((r) => ({ kind: 'request' as const, v: r }))];
    const tabOf = (t: string) => tabs[Object.keys(tabs).find((k) => k.trim().toLowerCase() === t.toLowerCase()) || ''];
    const archive = TABS.flatMap((t) => (tabOf(t) ? parts(tabOf(t) as unknown[][]).map((rows, part) => ({ tab: t, part, rows })) : []));
    const steps = 2 + archive.length + Math.ceil(records.length / CHUNK);
    let done = 0;
    const tick = () => setProgress({ done: ++done, total: steps });
    setProgress({ done: 0, total: steps });
    try {
      await peopleImportCall(studio, { action: 'begin', batch, meta: { fileName, counts: { attendance: attendance.length, requests: requests.length, attendanceRows: plan.counts.attendanceRows, leaveRows: plan.counts.leaveRows } } });
      tick();
      for (const a of archive) { await peopleImportCall(studio, { action: 'archive', batch, ...a }); tick(); }
      let written = 0;
      const skipped: { id: string; why: string }[] = [];
      for (let i = 0; i < records.length; i += CHUNK) {
        const part = records.slice(i, i + CHUNK);
        const r = await peopleImportCall(studio, {
          action: 'records', batch,
          attendance: part.filter((x) => x.kind === 'attendance').map((x) => x.v),
          requests: part.filter((x) => x.kind === 'request').map((x) => x.v),
        });
        written += r.written;
        skipped.push(...(r.skipped || []));
        tick();
      }
      await peopleImportCall(studio, { action: 'finish', batch });
      tick();
      /* Said before the settings change, which empties the plan's holidays and comp-off. */
      const added = [
        addHolidays && plan.holidays.length ? `${plan.holidays.length} holiday${plan.holidays.length === 1 ? '' : 's'}` : '',
        grantComp && plan.compGrants.length ? 'comp-off earned in People Hub' : '',
      ].filter(Boolean).join(' and ');
      if (added) onApply({ holidays: addHolidays ? plan.holidays : [], grants: grantComp ? plan.compGrants : [] });
      setResult({ written, skipped, added });
      onDone();
    } catch (e: any) {
      setError(`${e.message} Nothing is lost: choose Import again to carry on where it stopped.`);
      setProgress(null);
    }
  };

  if (result) {
    return (
      <Sheet eyebrow="People Hub import" title="Brought over" onClose={onClose} footer={<button type="button" className={btnPri} onClick={onClose}>Done</button>}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center hud-swap"><Check className="w-5 h-5" /></span>
          <div>
            <p className="text-sm font-bold text-slate-800"><CountUp value={result.written} /> record{result.written === 1 ? '' : 's'} saved to People.</p>
            <p className="text-xs text-slate-500">They show in Attendance, Leave and the monthly report, marked as from People Hub.</p>
          </div>
        </div>
        {result.skipped.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">{result.skipped.length} left as they were on StudioDesk</p>
            <ul className="text-xs text-amber-900 mt-1 space-y-0.5 max-h-40 overflow-y-auto">
              {[...new Set(result.skipped.map((s) => s.why))].map((why) => <li key={why}>{why}: {result.skipped.filter((s) => s.why === why).length}</li>)}
            </ul>
          </div>
        )}
        {result.added && (
          <p className="flex items-start gap-2 text-xs text-slate-700 rounded-xl border border-[#3D52A0]/20 bg-[#3D52A0]/5 px-3 py-2">
            <Dot tone="warn" />{result.added.charAt(0).toUpperCase() + result.added.slice(1)} added to these settings. Press Save changes at the bottom to keep them.
          </p>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet eyebrow="People Hub import · dry run" title="Check before anything is saved" sub={fileName} onClose={busy ? () => undefined : onClose}
      footer={<>
        {progress && <span className="text-xs text-slate-500 mr-auto tabular-nums">Saving {Math.min(progress.done + 1, progress.total)} of {progress.total}…</span>}
        {!progress && plan.blocking > 0 && <span className="text-xs text-amber-800 mr-auto">Answer {plan.blocking} question{plan.blocking === 1 ? '' : 's'} first.</span>}
        <button type="button" className={btnSec} disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={busy || cannot} onClick={save}>
          <Upload className="w-4 h-4" />{busy ? 'Importing…' : `Import ${total} record${total === 1 ? '' : 's'}`}
        </button>
      </>}>
      {progress && (
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
          <div className="h-full bg-[#3D52A0] transition-all duration-500" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
        </div>
      )}
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      {plan.problems.map((p) => (
        <p key={p} className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0" />{p}</p>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          [Users, 'People matched', `${matched} of ${plan.people.length}`, null],
          [Clock3, 'Attendance days', plan.attendance.length, plan.counts.noCheckout ? `${plan.counts.noCheckout} without check-out` : null],
          [CalendarDays, 'Leave requests', plan.requests.length, Object.entries(plan.counts.byStatus).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') || null],
          [Sun, 'New holidays', plan.holidays.length, null],
        ] as [React.ComponentType<any>, string, number | string, string | null][]).map(([Icon, k, v, sub], i) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 hud-row-in" style={{ animationDelay: `${i * 40}ms` }}>
            <p className={`${label} flex items-center gap-1.5`}><Icon className="w-3.5 h-3.5 text-slate-400" />{k}</p>
            <p className="text-sm font-black text-slate-800 tabular-nums mt-1">{typeof v === 'number' ? <CountUp value={v} /> : v}</p>
            {sub && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{sub}</p>}
          </div>
        ))}
      </div>

      {plan.questions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={label}>Your decisions</p>
          {plan.questions.map((q) => (
            <div key={`${q.kind}-${q.id}`} className={`rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-3 ${q.blocking ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{q.title}</p>
                <p className="text-[11px] text-slate-500">{q.detail}</p>
              </div>
              <select aria-label={q.title} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 max-w-[260px]"
                value={q.answer ?? ''} onChange={(e) => answer(q.kind, q.id, e.target.value)}>
                {q.kind === 'half' && !q.answer && <option value="" disabled>Choose…</option>}
                {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <Fold id="people" open={open} setOpen={setOpen} title="Who is who" sub={`${matched} matched by email${plan.people.length - matched ? `, ${plan.people.length - matched} not on your team` : ''}`}>
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {plan.people.map((p) => (
            <div key={p.row} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <Dot tone={p.personId ? 'ok' : 'warn'} />
              <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{p.name || p.email}<span className="text-[11px] font-normal text-slate-500"> · {p.email}</span></span>
              {p.isAdmin && <span className={`${chip} bg-slate-100 text-slate-600`} title="In StudioDesk, who runs People follows Team & roles">Admin in People Hub</span>}
              {!p.active && <span className={`${chip} bg-slate-100 text-slate-600`}>Inactive</span>}
              <span className="text-[11px] text-slate-500">{p.personId ? people.find((x) => x.id === p.personId)?.name : `not on Team & roles · ${p.attendanceRows} days left out`}</span>
            </div>
          ))}
        </div>
        {plan.notInHub.length > 0 && <p className="text-[11px] text-slate-500 mt-2">On your team but not in People Hub: {plan.notInHub.map((p) => p.name).join(', ')}.</p>}
        <p className="text-[11px] text-slate-500 mt-1">To bring someone's records over, add them in Team & roles with the same email, then choose the workbook again.</p>
      </Fold>

      {plan.recon.length > 0 && (
        <Fold id="recon" open={open} setOpen={setOpen} title="Balances" sub={disagree.length ? `${disagree.length} differ from People Hub's Balances tab` : "All agree with People Hub's Balances tab"} warn={disagree.length > 0}>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-xs">
              <thead><tr className={`text-left ${label} bg-slate-50`}>
                <th className="px-3 py-2">Person</th><th className="px-3 py-2">Year</th><th className="px-3 py-2">Leave</th>
                <th className="px-3 py-2 text-right">People Hub used</th><th className="px-3 py-2 text-right">StudioDesk counts</th><th className="px-3 py-2 text-right">Allowed</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {plan.recon.map((r) => (
                  <tr key={`${r.personId}-${r.fy}-${r.type}`} className={r.agrees ? '' : 'bg-amber-50'}>
                    <td className="px-3 py-1.5 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-3 py-1.5 tabular-nums">{r.fy}–{String(Number(r.fy) + 1).slice(2)}</td>
                    <td className="px-3 py-1.5">{r.type}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.hubUsed ?? '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.agrees ? '' : 'font-bold text-amber-800'}`}>{r.used}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.entitled}{r.hubEntitled != null && r.hubEntitled !== r.entitled && r.type !== 'COMP' ? <span className="text-amber-800"> (Hub {r.hubEntitled})</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">StudioDesk counts the approved leave it brings over; People Hub's totals are never applied on top. Where they differ, check the person's leave in People Hub, or set their allowance in "People and who they report to" below.</p>
        </Fold>
      )}

      {plan.settings.length > 0 && (
        <Fold id="settings" open={open} setOpen={setOpen} title="Working day" sub={plan.settings.every((x) => x.same) ? 'Same as these settings' : 'Some differ from these settings'} warn={!plan.settings.every((x) => x.same)}>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {plan.settings.map((x) => (
              <div key={x.label} className="flex items-center gap-3 px-3 py-2 text-xs">
                <Dot tone={x.same ? 'ok' : 'warn'} />
                <span className="font-semibold text-slate-800 w-28">{x.label}</span>
                <span className="text-slate-500 flex-1">People Hub {x.hub || '—'} · StudioDesk {x.studio || '—'}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Not changed by the import. Set them above if they should match.</p>
        </Fold>
      )}

      {(plan.holidays.length > 0 || plan.compGrants.length > 0) && (
        <div className="flex flex-col gap-2">
          <p className={label}>Into these settings</p>
          {plan.holidays.length > 0 && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#3D52A0]" checked={addHolidays} onChange={(e) => setAddHolidays(e.target.checked)} />
              <span className="min-w-0">
                <span className="text-sm font-semibold text-slate-800">Add {plan.holidays.length} holiday{plan.holidays.length === 1 ? '' : 's'}</span>
                <span className="block text-[11px] text-slate-500 truncate">{plan.holidays.slice(0, 6).map((h) => `${h.name} (${h.date.slice(8)}/${h.date.slice(5, 7)})`).join(', ')}{plan.holidays.length > 6 ? '…' : ''}</span>
              </span>
            </label>
          )}
          {plan.compGrants.length > 0 && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#3D52A0]" checked={grantComp} onChange={(e) => setGrantComp(e.target.checked)} />
              <span className="min-w-0">
                <span className="text-sm font-semibold text-slate-800">Grant the comp-off earned in People Hub</span>
                <span className="block text-[11px] text-slate-500">{plan.compGrants.map((g) => `${g.name} ${g.earned} day${g.earned === 1 ? '' : 's'} (FY ${g.fy})`).join(', ')}</span>
              </span>
            </label>
          )}
          <p className="text-[11px] text-slate-500">These go into the settings on this screen; press Save at the bottom afterwards to keep them.</p>
        </div>
      )}

      {reasons.length > 0 && (
        <Fold id="skipped" open={open} setOpen={setOpen} title="Left out" sub={`${plan.skipped.length} row${plan.skipped.length === 1 ? '' : 's'} stay in the workbook only`}>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {reasons.map(([why, n]) => (
              <div key={why} className="flex items-center gap-3 px-3 py-2 text-xs"><span className="flex-1 text-slate-700">{why}</span><span className="font-black text-slate-800 tabular-nums">{n}</span></div>
            ))}
          </div>
        </Fold>
      )}
      <p className="text-[11px] text-slate-500">Days already checked in on StudioDesk, and leave already booked here, stay as they are. A day with no check-out comes over as history, never as a day still open. Importing the same workbook again updates what it brought before.</p>
    </Sheet>
  );
}

const Fold: React.FC<{ id: string; open: string | null; setOpen: (v: string | null) => void; title: string; sub: string; warn?: boolean; children: React.ReactNode }> =
  ({ id, open, setOpen, title, sub, warn, children }) => (
    <div className="flex flex-col gap-2">
      <button type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}
        className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors">
        <Dot tone={warn ? 'warn' : 'ok'} />
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">{sub}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open === id ? 'rotate-180' : ''}`} />
      </button>
      {open === id && <div className="hud-row-in">{children}</div>}
    </div>
  );
