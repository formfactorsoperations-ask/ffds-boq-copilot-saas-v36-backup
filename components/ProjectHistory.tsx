import React, { useMemo, useState, useSyncExternalStore, useCallback } from 'react';
import { ProjectContext, HistoryEvent, HistoryCategory } from '../types';
import { CATEGORY_META } from '../lib/projectHistory';
import { db } from '../services/dbService';
import { getIoLog, subscribeIo, clearIoLog, getIntegritySnapshot, IoEvent } from '../services/dbAudit';
import {
  History, Clock, Database, Download, RefreshCw, CheckCircle2, AlertTriangle,
  HardDriveDownload, HardDriveUpload, Cloud, HardDrive, Search, ShieldCheck, ShieldAlert,
} from 'lucide-react';

// ============================================================================
// ProjectHistory — two views over one idea: "trust what the DB holds".
//   • Timeline: human-readable audit trail of meaningful project changes.
//   • Data trail: raw DB read/write log + a persisted-vs-in-memory check, so
//     you can verify what actually went into and came out of the DB.
// ============================================================================

export default function ProjectHistory({
  projectContext, activeInternalId,
}: {
  projectContext: ProjectContext;
  activeInternalId?: string | null;
}) {
  const [tab, setTab] = useState<'timeline' | 'data'>('timeline');

  return (
    <div className="max-w-3xl mx-auto my-6 space-y-4">
      <div className="flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-2xl grid place-items-center text-white shrink-0 shadow-lg bg-gradient-to-br from-sky-500 to-[#0055B3] shadow-sky-600/25">
          <History className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold text-slate-900 leading-tight">Project history</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every meaningful change, and proof of what's saved in the database.</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {(['timeline', 'data'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${tab === t ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {t === 'timeline' ? 'Timeline' : 'Data trail'}
          </button>
        ))}
      </div>

      {tab === 'timeline' ? <Timeline history={projectContext.history || []} /> : <DataTrail projectContext={projectContext} activeInternalId={activeInternalId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
function Timeline({ history }: { history: HistoryEvent[] }) {
  const [filter, setFilter] = useState<HistoryCategory | 'all'>('all');
  const events = useMemo(() => [...history].reverse().filter(e => filter === 'all' || e.category === filter), [history, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEvent[]>();
    events.forEach(e => {
      const day = new Date(e.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    });
    return [...map.entries()];
  }, [events]);

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-500">No history yet</p>
        <p className="text-xs text-slate-400 mt-1">As you move the project along — raise payments, freeze the BOQ, sign documents — those changes will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All ${history.length}`} dot="bg-slate-400" />
        {(Object.keys(CATEGORY_META) as HistoryCategory[]).map(c => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} label={CATEGORY_META[c].label} dot={CATEGORY_META[c].dot} />
        ))}
      </div>

      {groups.map(([day, evs]) => (
        <div key={day} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">{day}</p>
          <div className="relative pl-4">
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-100" />
            <div className="space-y-3">
              {evs.map(e => {
                const meta = CATEGORY_META[e.category];
                return (
                  <div key={e.id} className="relative">
                    <span className={`absolute -left-4 top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${meta.dot}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{e.summary}</p>
                        {e.detail && <p className="text-xs text-slate-400 mt-0.5">{e.detail}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.chip}`}>{meta.label}</span>
                        <p className="text-[10px] text-slate-400 mt-1 tabular-nums">{new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {e.actor}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; dot: string }> = ({ active, onClick, label, dot }) => {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {label}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Data trail — durability status, DB I/O log, and a persisted-vs-in-memory check.
// The point is honesty: it distinguishes "saved in this browser" from "durable
// in the database", and flags anything that isn't in a real database as at-risk.
// ---------------------------------------------------------------------------
function DataTrail({ projectContext, activeInternalId }: { projectContext: ProjectContext; activeInternalId?: string | null }) {
  const ioLog = useSyncExternalStore(subscribeIo, getIoLog);
  const integrity = useSyncExternalStore(subscribeIo, getIntegritySnapshot);
  const [scopeToProject, setScopeToProject] = useState(true);
  const [check, setCheck] = useState<null | { matches: boolean; bytes?: number; savedAt?: number; diffKeys: string[]; missing: boolean }>(null);
  const [checking, setChecking] = useState(false);

  const dbConnected = integrity.dbConnected;

  const rows = useMemo(
    () => ioLog.filter(e => !scopeToProject || !activeInternalId || !e.target || e.target === activeInternalId),
    [ioLog, scopeToProject, activeInternalId],
  );

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const projects = await db.getProjects();
      const persisted = projects.find((p: any) => p.id === activeInternalId);
      if (!persisted) { setCheck({ matches: false, diffKeys: [], missing: true }); return; }
      const savedCtx = (persisted as any).context || {};
      const liveCtx = projectContext || {};
      const keys = Array.from(new Set([...Object.keys(savedCtx), ...Object.keys(liveCtx)]));
      const diffKeys = keys.filter(k => k !== 'history' && JSON.stringify((savedCtx as any)[k]) !== JSON.stringify((liveCtx as any)[k]));
      const bytes = (() => { try { return new Blob([JSON.stringify(persisted)]).size; } catch { return undefined; } })();
      setCheck({ matches: diffKeys.length === 0, bytes, savedAt: (persisted as any).lastModified, diffKeys, missing: false });
    } catch {
      setCheck({ matches: false, diffKeys: [], missing: true });
    } finally { setChecking(false); }
  }, [projectContext, activeInternalId]);

  const exportJson = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(projectContext, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `project-${activeInternalId || 'context'}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, [projectContext, activeInternalId]);

  return (
    <div className="space-y-4">
      {/* Durability banner — the headline truth */}
      {dbConnected ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white grid place-items-center shrink-0"><ShieldCheck className="w-5 h-5" /></div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5"><Cloud className="w-4 h-4" /> Database connected — changes are durable</p>
            <p className="text-xs text-emerald-700/80 mt-0.5">
              {integrity.durable} write{integrity.durable === 1 ? '' : 's'} confirmed to the database this session
              {integrity.atRisk > 0 ? <> · <span className="font-bold text-amber-700">{integrity.atRisk} still catching up</span></> : ''}
              {integrity.lastDurableAt ? ` · last ${new Date(integrity.lastDurableAt).toLocaleTimeString()}` : ''}.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white grid place-items-center shrink-0"><ShieldAlert className="w-5 h-5" /></div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5"><HardDrive className="w-4 h-4" /> No database connected — data is local-only</p>
            <p className="text-xs text-amber-700/90 mt-0.5">
              Every change is stored only in this browser ({integrity.localOnly} this session). It is <span className="font-bold">not durable</span> — clearing the browser or switching device loses it. Connect a database to make changes permanent.
            </p>
          </div>
        </div>
      )}

      {/* Integrity tiles */}
      <div className="grid grid-cols-3 gap-3">
        <IntegrityTile label="Writes (session)" value={integrity.writes} tone="slate" icon={HardDriveUpload} />
        <IntegrityTile label="Durable in DB" value={integrity.durable} tone={dbConnected ? 'emerald' : 'slate'} icon={ShieldCheck} />
        <IntegrityTile label="At risk" value={integrity.atRisk} tone={integrity.atRisk > 0 ? 'amber' : 'slate'} icon={ShieldAlert} />
      </div>

      {/* Persisted vs in-memory */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Read it back</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
            {dbConnected ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />} {dbConnected ? 'Cloud (Firestore)' : 'Browser only'}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">Reads the project back from the {dbConnected ? 'database' : 'browser store'} and compares it to what's loaded in the app right now — confirms your latest change actually landed.</p>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={runCheck} disabled={checking}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl disabled:opacity-50">
            {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Check now
          </button>
          <button onClick={exportJson} className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl">
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
        </div>
        {check && (
          <div className={`rounded-xl border p-3 ${check.missing ? 'border-amber-200 bg-amber-50/60' : check.matches ? (dbConnected ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/50') : 'border-amber-200 bg-amber-50/60'}`}>
            <div className="flex items-center gap-2">
              {check.missing
                ? <><AlertTriangle className="w-4 h-4 text-amber-500" /><p className="text-sm font-bold text-amber-800">Not found in the {dbConnected ? 'database' : 'store'} yet</p></>
                : check.matches
                  ? dbConnected
                    ? <><ShieldCheck className="w-4 h-4 text-emerald-500" /><p className="text-sm font-bold text-emerald-800">Durable — database copy matches the app</p></>
                    : <><HardDrive className="w-4 h-4 text-amber-500" /><p className="text-sm font-bold text-amber-800">Saved in this browser only — not in a database</p></>
                  : <><AlertTriangle className="w-4 h-4 text-amber-500" /><p className="text-sm font-bold text-amber-800">{check.diffKeys.length} field{check.diffKeys.length === 1 ? '' : 's'} not yet written</p></>}
            </div>
            {!check.missing && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                {check.bytes != null && <>Stored size {fmtBytes(check.bytes)} · </>}
                {check.savedAt && <>last saved {new Date(check.savedAt).toLocaleTimeString()}</>}
              </p>
            )}
            {check.diffKeys.length > 0 && (
              <p className="text-[11px] text-amber-700 mt-1.5">Differs on: <span className="font-mono">{check.diffKeys.join(', ')}</span> <span className="text-slate-400">(auto-save runs ~2s after a change)</span></p>
            )}
          </div>
        )}
      </div>

      {/* I/O log */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400"><Database className="w-3.5 h-3.5" /> Database activity</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
              <input type="checkbox" checked={scopeToProject} onChange={e => setScopeToProject(e.target.checked)} className="accent-[#0066CC]" /> This project only
            </label>
            <button onClick={clearIoLog} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider">Clear</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No database activity captured this session yet.</p>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto custom-scrollbar">
            {rows.map(e => <IoRow key={e.id} e={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  slate: 'text-slate-700', emerald: 'text-emerald-600', amber: 'text-amber-600',
};
const IntegrityTile: React.FC<{ label: string; value: number; tone: 'slate' | 'emerald' | 'amber'; icon: any }> = ({ label, value, tone, icon: Icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
    <Icon className={`w-4 h-4 mb-1.5 ${TILE_TONES[tone]}`} />
    <p className={`text-2xl font-bold tabular-nums leading-none ${TILE_TONES[tone]}`}>{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1.5">{label}</p>
  </div>
);

const SYNC_BADGE: Record<string, { label: string; cls: string }> = {
  cloud: { label: 'In DB', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  'local-only': { label: 'Local only', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  failed: { label: 'Failed', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
};

const IoRow: React.FC<{ e: IoEvent }> = ({ e }) => {
  const write = e.kind === 'write';
  const badge = e.synced ? SYNC_BADGE[e.synced] : null;
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-slate-50 text-sm">
      <div className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${write ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
        {write ? <HardDriveUpload className="w-3.5 h-3.5" /> : <HardDriveDownload className="w-3.5 h-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-700 truncate">{e.op}{e.target ? <span className="text-slate-400 font-normal"> · {e.target}</span> : ''}</p>
        <p className="text-[10px] text-slate-400 tabular-nums">{new Date(e.at).toLocaleTimeString()} · {e.mode}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2 text-[11px] tabular-nums">
        {badge && <span className={`hidden sm:inline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>}
        {e.bytes != null && <span className="text-slate-400">{fmtBytes(e.bytes)}</span>}
        <span className="text-slate-400">{e.ms}ms</span>
        {e.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-500" />}
      </div>
    </div>
  );
};

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
