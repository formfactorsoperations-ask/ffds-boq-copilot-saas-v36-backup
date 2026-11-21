import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock, X } from '@/lib/lucide-shim';
import { Item, FullProjectData } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Button, Chip, Segmented } from '../ui/kit';
import {
  LockPlan, PriceLockFile, buildPriceLockFile, lockBlocker, lockWasSaved, planPriceLock, planPriceUnlock, priceLockFileName, readPriceLockFile,
} from '../../lib/priceLock';
import '../projectHeader/projectHeader.css';

interface Props {
  bank: Item[];
  studio: string;
  /** The projects as stored now, every option's lines loaded. `stored`: without this session's open copy. */
  read: (stored?: boolean) => Promise<FullProjectData[]>;
  save: (project: FullProjectData) => Promise<void>;
  onClose: () => void;
}

type Phase = 'reading' | 'choose' | 'working' | 'done' | 'failed';
type Mode = 'lock' | 'undo';
interface Row { plan: LockPlan; why: string | null }
interface Result { id: string; name: string; outcome: 'done' | 'left' | 'failed'; note: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const statusOf = (s: string | null) => String(s || 'draft').replace(/_/g, ' ');
/* Finished and running projects first: they are the ones a bank edit must not touch. */
const ORDER = ['completed', 'execution', 'work_paused', 'won', 'negotiation', 'proposal_sent', 'lead', 'draft', 'lost'];
const rank = (s: string | null) => { const i = ORDER.indexOf(String(s || 'draft')); return i < 0 ? ORDER.length : i; };

function download(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Item Bank → Lock prices (lib/priceLock.ts).
 *
 * Lists every project with what locking would write and the proof that no
 * total moves. Nothing is saved from the list: on the button it reads the
 * ticked projects again, checks each once more, downloads the lock file, saves,
 * then reads back what was stored. A lock file undoes its own lock.
 */
export default function PriceLockModal({ bank, studio, read, save, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('reading');
  const [mode, setMode] = useState<Mode>('lock');
  const [file, setFile] = useState<PriceLockFile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<'todo' | 'all'>('todo');
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [savedFile, setSavedFile] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  // The newest handlers, whatever render this window's work began in.
  const readRef = useRef(read); readRef.current = read;
  const saveRef = useRef(save); saveRef.current = save;

  const planFor = (p: FullProjectData, m: Mode, f: PriceLockFile | null): LockPlan =>
    m === 'undo' ? planPriceUnlock(p, bank, f?.projects.find((x) => x.id === String(p.id))?.record || []) : planPriceLock(p, bank);

  const load = async (m: Mode, f: PriceLockFile | null) => {
    setPhase('reading'); setMode(m); setFile(f); setTicked(new Set()); setResults([]); setError(''); setSavedFile('');
    try {
      const projects = await readRef.current();
      const inFile = f ? new Set(f.projects.map((x) => x.id)) : null;
      setRows(projects
        .filter((p) => p && p.id && (!inFile || inFile.has(String(p.id))))
        .map((p) => ({ plan: planFor(p, m, f), why: lockBlocker(p) }))
        .sort((a, b) => rank(a.plan.status) - rank(b.plan.status) || a.plan.name.localeCompare(b.plan.name)));
      setShow(m === 'undo' ? 'all' : 'todo');
      setPhase('choose');
    } catch (e: any) {
      setError(e?.message || 'The projects could not be read.');
      setPhase('failed');
    }
  };

  useEffect(() => { load('lock', null); /* once, on opening */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'working') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, phase]);

  const can = (r: Row) => !r.why && r.plan.changed > 0 && r.plan.same;
  const todo = useMemo(() => rows.filter(can), [rows]);
  const shown = show === 'todo' ? todo : rows;
  const lines = todo.reduce((n, r) => n + r.plan.changed, 0);
  const tickedRows = todo.filter((r) => ticked.has(r.plan.projectId));

  const flip = (id: string) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    f.text().then((text) => {
      const parsed = readPriceLockFile(text);
      if (!parsed) { setError('That is not a lock file. Pick the file this window downloaded when the prices were locked.'); return; }
      load('undo', parsed);
    });
  };

  const apply = async () => {
    const ids = tickedRows.map((r) => r.plan.projectId);
    if (!ids.length) return;
    setPhase('working');
    const done = mode === 'undo' ? 'Lock removed' : 'Locked';
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Connect and try again; nothing was changed.');
      setProgress('Reading the projects again…');
      const fresh = new Map<string, FullProjectData>((await readRef.current()).map((p) => [String(p.id), p] as [string, FullProjectData]));
      const out: Result[] = [];
      const go: Array<{ plan: LockPlan; original: FullProjectData }> = [];
      ids.forEach((id) => {
        const original = fresh.get(id);
        const name = rows.find((r) => r.plan.projectId === id)?.plan.name || id;
        const why = lockBlocker(original);
        if (!original || why) { out.push({ id, name, outcome: 'left', note: why || 'It could not be found.' }); return; }
        const plan = planFor(original, mode, file);
        if (!plan.changed) out.push({ id, name, outcome: 'left', note: 'There was nothing to change.' });
        else if (!plan.same) out.push({ id, name, outcome: 'left', note: 'A total would have changed, so it was left as it is.' });
        else go.push({ plan, original });
      });

      if (go.length && mode === 'lock') {
        const at = Date.now();
        const name = priceLockFileName(studio, at);
        download(buildPriceLockFile(go.map((g) => g.plan), go.map((g) => g.original), { studio, at }), name);
        setSavedFile(name);
      }

      for (let i = 0; i < go.length; i++) {
        setProgress(`Saving ${i + 1} of ${go.length}: ${go[i].plan.name}`);
        try { await saveRef.current(go[i].plan.project); } catch { /* the check below says what was stored */ }
      }

      if (go.length) {
        setProgress('Checking what was saved…');
        const stored = new Map<string, FullProjectData>((await readRef.current(true)).map((p) => [String(p.id), p] as [string, FullProjectData]));
        go.forEach(({ plan }) => out.push(lockWasSaved(stored.get(plan.projectId), plan, bank)
          ? { id: plan.projectId, name: plan.name, outcome: 'done', note: `${done} on ${plural(plan.changed, 'line')}. Every total is the same as before.` }
          : { id: plan.projectId, name: plan.name, outcome: 'failed', note: 'The save could not be confirmed. Open the project to check it, then try again.' }));
      }
      setResults(out);
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Open the projects to check them before trying again.');
      setPhase('failed');
    }
  };

  const title = mode === 'undo' ? 'Remove a price lock' : 'Lock prices on projects';
  const blurb = mode === 'undo'
    ? 'Takes off exactly what the lock file added, and keeps any price edited since. A project is only changed when every total stays the same.'
    : 'Each line keeps the materials, labour and margin it uses today, so a change in the Item Bank no longer re-prices the project. A project is only changed when every total stays exactly the same.';

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label={title}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={phase === 'working' ? undefined : onClose} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="p-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Item Bank</p>
              <h3 className="font-bold text-slate-800 mt-1">{title}</h3>
              <p className="text-xs text-slate-500 mt-1">{blurb}</p>
            </div>
            <button type="button" onClick={onClose} disabled={phase === 'working'} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="w-4 h-4" /></button>
          </div>

          {phase === 'choose' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {mode === 'lock' && (
                <Segmented
                  size="sm"
                  label="Which projects to show"
                  value={show}
                  onChange={setShow}
                  options={[{ id: 'todo', label: 'To lock', count: todo.length }, { id: 'all', label: 'All projects', count: rows.length }]}
                />
              )}
              <span className="text-xs text-slate-500">{plural(todo.length, 'project')}, {plural(lines, 'line')} {mode === 'undo' ? 'to put back' : 'to lock'}</span>
              {todo.length > 0 && (
                <Button
                  variant="quiet"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setTicked(tickedRows.length === todo.length ? new Set() : new Set(todo.map((r) => r.plan.projectId)))}
                >
                  {tickedRows.length === todo.length ? 'Clear ticks' : `Tick all ${todo.length}`}
                </Button>
              )}
            </div>
          )}
          {error && phase === 'choose' && <p className="mt-2 text-xs text-rose-700">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-[12rem]">
          {phase === 'reading' && <p className="hud-scanning text-xs text-slate-500 p-6 text-center">Reading every project and checking its totals…</p>}
          {phase === 'working' && <p className="hud-scanning text-xs text-slate-500 p-6 text-center">{progress}</p>}
          {phase === 'failed' && <p className="text-xs text-rose-700 p-6 text-center">{error}</p>}

          {phase === 'choose' && shown.length === 0 && (
            <p className="text-xs text-slate-500 p-6 text-center">
              {mode === 'undo' ? 'None of the projects in that file are in this studio.' : rows.length ? 'Every project already holds its own prices.' : 'There are no projects yet.'}
            </p>
          )}

          {phase === 'choose' && shown.map((r, i) => {
            const { plan } = r;
            const on = ticked.has(plan.projectId);
            const ok = can(r);
            return (
              <div key={plan.projectId} className="hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <button
                  type="button"
                  onClick={() => ok && flip(plan.projectId)}
                  aria-pressed={on}
                  disabled={!ok}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-slate-50 disabled:hover:bg-transparent disabled:cursor-default"
                >
                  <span className={`w-5 h-5 rounded-md grid place-items-center border-2 shrink-0 transition-colors ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : ok ? 'border-slate-300 text-transparent' : 'border-slate-200 text-transparent'}`}>
                    <Check className="w-3 h-3" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-semibold truncate ${ok ? 'text-slate-800' : 'text-slate-500'}`}>{plan.name}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {statusOf(plan.status)} · {plural(plan.options.length, 'option')}
                      {plan.changed > 0 && ` · ${plural(plan.changed, 'line')} ${mode === 'undo' ? 'to put back' : 'to lock'}`}
                      {r.why && ` · ${r.why}`}
                    </span>
                  </span>
                  {plan.skipped > 0 && <Chip tone="warn" title="Their item holds a rate the app cannot read, or one it adds up wrongly. They are left as they are.">{plural(plan.skipped, 'line')} left out</Chip>}
                  {r.why ? <Chip tone="warn">Left alone</Chip>
                    : !plan.changed ? <Chip>Nothing to {mode === 'undo' ? 'put back' : 'lock'}</Chip>
                    : plan.same ? <Chip tone="good">Totals unchanged</Chip>
                    : <Chip tone="bad" title="Locking would change a total, so this project cannot be locked from here.">A total would change</Chip>}
                </button>
                {(on || (!plan.same && plan.changed > 0)) && (
                  <div className="ml-10 mr-2 mb-2 rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {plan.options.filter((o) => o.changed > 0).map((o) => (
                      <div key={o.tierId} className="flex items-center gap-3 px-3 py-1.5 text-[11px] text-slate-500">
                        <span className="flex-1 min-w-0 truncate text-slate-700">{o.tierName || 'Option'}</span>
                        <span className="tabular-nums whitespace-nowrap">{o.changed} of {plural(o.lines, 'line')}</span>
                        {o.same
                          ? <span className="tabular-nums whitespace-nowrap font-semibold text-slate-700">{formatCurrency(o.before)} before and after</span>
                          : <span className="tabular-nums whitespace-nowrap font-semibold text-rose-700">{formatCurrency(o.before)} would become {formatCurrency(o.after)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {phase === 'done' && (
            <div className="divide-y divide-slate-100">
              {results.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{r.name}</span>
                    <span className="block text-xs text-slate-500">{r.note}</span>
                  </span>
                  <Chip tone={r.outcome === 'done' ? 'good' : r.outcome === 'failed' ? 'bad' : 'slate'}>
                    {r.outcome === 'done' ? (mode === 'undo' ? 'Lock removed' : 'Locked') : r.outcome === 'failed' ? 'Not confirmed' : 'Left as it is'}
                  </Chip>
                </div>
              ))}
              {savedFile && <p className="p-2.5 text-xs text-slate-500">Keep the downloaded file <b className="font-semibold text-slate-700">{savedFile}</b>: it holds the lines as they were, and it is what “Undo from a lock file” reads.</p>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {phase === 'choose' && mode === 'lock' && <Button variant="quiet" size="sm" onClick={() => { setError(''); fileInput.current?.click(); }}>Undo from a lock file</Button>}
            {phase !== 'working' && phase !== 'reading' && (mode === 'undo' || phase === 'done' || phase === 'failed') && <Button variant="quiet" size="sm" onClick={() => load('lock', null)}>{mode === 'undo' && phase === 'choose' ? 'Back to locking' : 'Check the projects again'}</Button>}
            <input ref={fileInput} type="file" accept=".json,application/json" onChange={pickFile} className="hidden" aria-label="Lock file" />
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={phase === 'working'}>{phase === 'done' ? 'Close' : 'Cancel'}</Button>
            {phase === 'choose' && (
              <Button variant="primary" icon={Lock} onClick={apply} disabled={!tickedRows.length}>
                {mode === 'undo' ? `Remove the lock on ${plural(tickedRows.length, 'project')}` : `Lock prices on ${plural(tickedRows.length, 'project')}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
