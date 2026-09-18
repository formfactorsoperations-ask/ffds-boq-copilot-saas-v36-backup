import React, { useMemo, useState, useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
import { ProjectContext, HistoryEvent, HistoryCategory } from '../types';
import { CATEGORY_META } from '../lib/projectHistory';
import { db } from '../services/dbService';
import { getIoLog, subscribeIo, clearIoLog, getIntegritySnapshot, IoEvent } from '../services/dbAudit';
import {
  History, Clock, Database, Download, RefreshCw, CheckCircle2, AlertTriangle,
  HardDriveDownload, HardDriveUpload, Cloud, HardDrive, Search, ShieldCheck, ShieldAlert,
  ChevronDown, X,
} from 'lucide-react';

// ============================================================================
// ProjectHistory — two views over one idea: "trust what the DB holds".
//   • Timeline: human-readable audit trail of meaningful project changes.
//   • Data trail: raw DB read/write log + a persisted-vs-in-memory check, so
//     you can verify what actually went into and came out of the DB.
//
// The timeline used to be a flat reverse-chronological list, which is the
// wrong shape for this data: a real project here carries 150 events built from
// four distinct summaries, so 149 rows of near-duplicate churn buried the one
// event that actually marked the project. Repeats now fold, and the header
// says plainly how much of the log is repetition.
// ============================================================================

const INK = '#12182F';
const PRIMARY = '#3D52A0';
const MUTED = '#5A628A';
const SOFT = '#8E96B8';
const LINE = '#E2E5F0';
const PALE = '#ADBBDA';
const HAIR = '#EDEFF7';

export default function ProjectHistory({
  projectContext, activeInternalId,
}: {
  projectContext: ProjectContext;
  activeInternalId?: string | null;
}) {
  const [tab, setTab] = useState<'timeline' | 'data'>('timeline');

  return (
    <div className="max-w-[1600px] mx-auto py-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-black tracking-tight" style={{ color: INK }}>Project history</h1>
          <p className="text-[11px] mt-0.5" style={{ color: SOFT }}>Every meaningful change, and proof of what is saved in the database.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['timeline', 'data'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors border"
              style={tab === t
                ? { background: PRIMARY, color: '#fff', borderColor: PRIMARY }
                : { background: '#fff', color: MUTED, borderColor: LINE }}>
              {t === 'timeline' ? 'Timeline' : 'Data trail'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'timeline' ? <Timeline history={projectContext.history || []} projectId={activeInternalId} /> : <DataTrail projectContext={projectContext} activeInternalId={activeInternalId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** One row: either a single event, or a run of identical ones folded together. */
interface Run {
  key: string;
  first: HistoryEvent;
  events: HistoryEvent[];
}

/*
  Local calendar day, not the UTC one.

  toISOString() is UTC, and dayLabel below is local. Five and a half hours
  east of Greenwich that splits one Indian day across two keys — the ledger
  rendered "Mon, Aug 17" twice and the activity strip labelled Aug 6 as Aug 7.
*/
const dayKey = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hhmm = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dayLabel = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Timeline({ history, projectId }: { history: HistoryEvent[]; projectId?: string | null }) {
  const [filter, setFilter] = useState<HistoryCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /*
    When this browser last opened the history.

    Read once on mount and held, so the divider does not jump to the bottom
    the moment the screen renders. Per browser, never synced — a shared
    project would need a per-user record, which does not exist yet.
  */
  const lastSeenKey = `ffds:history:lastSeen:${projectId || 'none'}`;
  const [lastSeen] = useState<number>(() => {
    try { return Number(localStorage.getItem(lastSeenKey)) || 0; } catch { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem(lastSeenKey, String(Date.now())); } catch { /* private mode */ }
  }, [lastSeenKey]);

  const q = query.trim().toLowerCase();
  const events = useMemo(() => [...history].reverse().filter(e => {
    if (filter !== 'all' && e.category !== filter) return false;
    if (!q) return true;
    return `${e.summary} ${e.detail || ''} ${e.actor}`.toLowerCase().includes(q);
  }), [history, filter, q]);

  /* What the log is actually made of, stated rather than discovered by scrolling. */
  const shape = useMemo(() => {
    const bySummary = new Map<string, number>();
    const days = new Set<string>();
    const actors = new Set<string>();
    history.forEach(e => {
      bySummary.set(e.summary, (bySummary.get(e.summary) || 0) + 1);
      days.add(dayKey(e.at));
      actors.add(e.actor);
    });
    return {
      total: history.length,
      distinct: bySummary.size,
      once: [...bySummary.values()].filter(n => n === 1).length,
      days: days.size,
      actors: actors.size,
      newSince: lastSeen ? history.filter(e => e.at > lastSeen).length : 0,
    };
  }, [history, lastSeen]);

  /* Volume per active day, for the strip. */
  const perDay = useMemo(() => {
    const m = new Map<string, { at: number; n: number }>();
    history.forEach(e => {
      const k = dayKey(e.at);
      const hit = m.get(k);
      if (hit) hit.n += 1; else m.set(k, { at: e.at, n: 1 });
    });
    return [...m.entries()].sort((a, b) => a[1].at - b[1].at);
  }, [history]);
  const peakDay = Math.max(1, ...perDay.map(([, v]) => v.n));

  /*
    Day groups, with identical events folded into one row per day.

    Folding only consecutive runs was not enough: the stage events on a real
    project alternate (Design → Execution → Design …), so 109 of 150 rows
    never sat next to their own duplicate and nothing collapsed. Folding by
    summary within the day is what actually clears the noise — it costs strict
    chronology inside a day, which the time range on the row and the expanded
    list of timestamps give back.
  */
  const groups = useMemo(() => {
    const out: { key: string; label: string; runs: Run[]; count: number }[] = [];
    const index = new Map<string, Run>();
    events.forEach(e => {
      const k = dayKey(e.at);
      let group = out[out.length - 1];
      if (!group || group.key !== k) {
        group = { key: k, label: dayLabel(e.at), runs: [], count: 0 };
        out.push(group);
        index.clear();
      }
      group.count += 1;
      const id = `${e.summary}|${e.category}|${e.actor}`;
      const hit = index.get(id);
      if (hit) {
        hit.events.push(e);
      } else {
        const run: Run = { key: `${k}:${e.id}`, first: e, events: [e] };
        index.set(id, run);
        group.runs.push(run);
      }
    });
    return out;
  }, [events]);

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-white p-10 text-center" style={{ borderColor: LINE }}>
        <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: PALE }} />
        <p className="text-sm font-bold" style={{ color: MUTED }}>No history yet</p>
        <p className="text-xs mt-1" style={{ color: SOFT }}>As you move the project along — raise payments, freeze the BOQ, sign documents — those changes appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── what this log is made of ──────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: LINE }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
            <History className="w-3.5 h-3.5" style={{ color: PRIMARY }} /> What is in here
          </span>
          <Fact n={shape.total} label="events" />
          <Fact n={shape.distinct} label="distinct" />
          <Fact n={shape.once} label="happened once" />
          <Fact n={shape.days} label={shape.days === 1 ? 'active day' : 'active days'} />
          <Fact n={shape.actors} label={shape.actors === 1 ? 'person' : 'people'} />
          {shape.newSince > 0 && (
            <span className="text-[11px] font-bold" style={{ color: PRIMARY }}>{shape.newSince} since you last looked</span>
          )}
        </div>

        {/* ── activity per day, click to jump ───────────────────────── */}
        {perDay.length > 1 && (
          <div className="flex items-end gap-1.5 mt-4 pt-3 border-t" style={{ borderColor: HAIR }}>
            {perDay.map(([k, v]) => (
              <button
                key={k}
                onClick={() => dayRefs.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex-1 min-w-0 group"
                title={`${v.n} events on ${dayLabel(v.at)} — jump there`}
              >
                <div className="w-full rounded-t transition-colors" style={{
                  height: `${Math.max(4, (v.n / peakDay) * 34)}px`,
                  background: PRIMARY,
                  opacity: 0.35 + 0.65 * (v.n / peakDay),
                }} />
                <span className="block text-[9px] mt-1 truncate tabular-nums" style={{ color: SOFT }}>
                  {new Date(v.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
                <span className="block text-[9px] tabular-nums" style={{ color: PALE }}>{v.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── search + category ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: PALE }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search summary, detail or person…"
            className="w-full rounded-xl border bg-white pl-9 pr-8 py-2 text-xs font-semibold outline-none focus:border-[#3D52A0]"
            style={{ borderColor: LINE, color: INK }}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: PALE }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All ${history.length}`} dot="bg-[#ADBBDA]" />
        {(Object.keys(CATEGORY_META) as HistoryCategory[]).map(c => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} label={CATEGORY_META[c].label} dot={CATEGORY_META[c].dot} />
        ))}
      </div>

      {events.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-xs" style={{ borderColor: LINE, color: SOFT }}>
          Nothing matches {q ? `“${query}”` : 'that filter'}.
        </div>
      )}

      {/* ── the ledger ────────────────────────────────────────────────── */}
      {groups.map(group => (
        <div key={group.key} ref={el => { dayRefs.current[group.key] = el; }}
             className="rounded-2xl border bg-white p-4 scroll-mt-4" style={{ borderColor: LINE }}>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: SOFT }}>{group.label}</p>
            <span className="text-[10px] tabular-nums" style={{ color: PALE }}>{group.count} {group.count === 1 ? 'event' : 'events'}</span>
          </div>

          <div className="relative pl-4">
            <div className="absolute left-[5px] top-1 bottom-1 w-px" style={{ background: HAIR }} />
            <div className="space-y-2.5">
              {group.runs.map(run => {
                const meta = CATEGORY_META[run.first.category];
                const many = run.events.length > 1;
                const isOpen = !!open[run.key];
                const unseen = run.first.at > lastSeen && lastSeen > 0;
                return (
                  <div key={run.key} className="relative">
                    <span className={`absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${meta.dot}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-bold" style={{ color: INK }}>{run.first.summary}</p>
                          {many && (
                            <button
                              onClick={() => setOpen(o => ({ ...o, [run.key]: !o[run.key] }))}
                              className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-1.5 py-[1px] transition-colors"
                              style={{ color: MUTED, borderColor: LINE, background: '#F6F7FB' }}
                              aria-expanded={isOpen}
                            >
                              ×{run.events.length}
                              <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                          {unseen && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded"
                                  style={{ color: PRIMARY, background: '#EDE8F5' }}>new</span>
                          )}
                        </div>
                        {run.first.detail && <p className="text-[11px] mt-0.5" style={{ color: SOFT }}>{run.first.detail}</p>}

                        {many && isOpen && (
                          <div className="mt-1.5 space-y-0.5 border-l pl-2.5" style={{ borderColor: HAIR }}>
                            {[...run.events].sort((a, b) => a.at - b.at).map(e => (
                              <p key={e.id} className="text-[10px] tabular-nums" style={{ color: PALE }}>
                                {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                {e.detail ? ` · ${e.detail}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.chip}`}>{meta.label}</span>
                        <p className="text-[10px] mt-1 tabular-nums" style={{ color: PALE }}>
                          {many
                            ? `${hhmm(Math.min(...run.events.map(x => x.at)))}–${hhmm(Math.max(...run.events.map(x => x.at)))}`
                            : new Date(run.first.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{run.first.actor}
                        </p>
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

const Fact: React.FC<{ n: number; label: string }> = ({ n, label }) => (
  <span className="text-[11px]" style={{ color: SOFT }}>
    <b className="tabular-nums" style={{ color: INK }}>{n}</b> {label}
  </span>
);

const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; dot: string }> = ({ active, onClick, label, dot }) => (
  <button onClick={onClick}
    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors"
    style={active
      ? { background: INK, color: '#fff', borderColor: INK }
      : { background: '#fff', color: MUTED, borderColor: LINE }}>
    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {label}
  </button>
);

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
      <div className="rounded-2xl border border-[#E2E5F0] bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8E96B8]">Read it back</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#5A628A]">
            {dbConnected ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />} {dbConnected ? 'Cloud (Firestore)' : 'Browser only'}
          </span>
        </div>
        <p className="text-xs text-[#8E96B8] mb-3">Reads the project back from the {dbConnected ? 'database' : 'browser store'} and compares it to what's loaded in the app right now — confirms your latest change actually landed.</p>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={runCheck} disabled={checking}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold rounded-xl disabled:opacity-50">
            {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Check now
          </button>
          <button onClick={exportJson} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#EDEFF7] hover:bg-[#E2E5F0] text-[#5A628A] text-xs font-bold rounded-xl">
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
              <p className="text-[11px] text-[#5A628A] mt-1.5">
                {check.bytes != null && <>Stored size {fmtBytes(check.bytes)} · </>}
                {check.savedAt && <>last saved {new Date(check.savedAt).toLocaleTimeString()}</>}
              </p>
            )}
            {check.diffKeys.length > 0 && (
              <p className="text-[11px] text-amber-700 mt-1.5">Differs on: <span className="font-mono">{check.diffKeys.join(', ')}</span> <span className="text-[#8E96B8]">(auto-save runs ~2s after a change)</span></p>
            )}
          </div>
        )}
      </div>

      {/* I/O log */}
      <div className="rounded-2xl border border-[#E2E5F0] bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8E96B8]"><Database className="w-3.5 h-3.5" /> Database activity</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5A628A] cursor-pointer">
              <input type="checkbox" checked={scopeToProject} onChange={e => setScopeToProject(e.target.checked)} className="accent-[#3D52A0]" /> This project only
            </label>
            <button onClick={clearIoLog} className="text-[10px] font-bold text-[#8E96B8] hover:text-[#5A628A] uppercase tracking-wider">Clear</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-[#8E96B8] py-6 text-center">No database activity captured this session yet.</p>
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
  slate: 'text-[#3A416B]', emerald: 'text-emerald-600', amber: 'text-amber-600',
};
const IntegrityTile: React.FC<{ label: string; value: number; tone: 'slate' | 'emerald' | 'amber'; icon: any }> = ({ label, value, tone, icon: Icon }) => (
  <div className="rounded-2xl border border-[#E2E5F0] bg-white shadow-sm p-3">
    <Icon className={`w-4 h-4 mb-1.5 ${TILE_TONES[tone]}`} />
    <p className={`text-2xl font-bold tabular-nums leading-none ${TILE_TONES[tone]}`}>{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E96B8] mt-1.5">{label}</p>
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
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-[#F6F7FB] text-sm">
      <div className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${write ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
        {write ? <HardDriveUpload className="w-3.5 h-3.5" /> : <HardDriveDownload className="w-3.5 h-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[#3A416B] truncate">{e.op}{e.target ? <span className="text-[#8E96B8] font-normal"> · {e.target}</span> : ''}</p>
        <p className="text-[10px] text-[#8E96B8] tabular-nums">{new Date(e.at).toLocaleTimeString()} · {e.mode}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2 text-[11px] tabular-nums">
        {badge && <span className={`hidden sm:inline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>}
        {e.bytes != null && <span className="text-[#8E96B8]">{fmtBytes(e.bytes)}</span>}
        <span className="text-[#8E96B8]">{e.ms}ms</span>
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
