import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, PenTool, Search } from 'lucide-react';
import { ProjectMark } from '../drawingReview/DeskParts';
import { Card, Empty, SectionTitle, Tag, cx } from './parts';

/*
  DESIGN DESK 2.0: Home's project list.

  It was a wall of equal cards, three across, most of them projects with no
  drawing yet, with names cut short and a tag on some and an arrow on others
  (owner, 25 Nov 2026: "very messy"). Now:

  - the projects that have drawings are one list, a line each, in the same
    columns: the name and client, how many drawings are approved (a bar), what
    needs the person, and the arrow. The ones that need the person come first;
  - the projects with no drawing yet are folded away under one line that says
    how many there are, and open as small tiles;
  - with more than a handful of projects there is a box to find one by name.
*/

export interface ProjectRow { id: string; name: string; client?: string; code: string; color: string; total: number; need: number; done: number }

const SEARCH_FROM = 9;

export default function ProjectList({ projects, onOpen }: { projects: ProjectRow[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [showIdle, setShowIdle] = useState(false);
  const find = q.trim().toLowerCase();
  const shown = useMemo(() => (find ? projects.filter((p) => `${p.name} ${p.client || ''}`.toLowerCase().includes(find)) : projects), [projects, find]);
  const active = shown.filter((p) => p.total > 0);
  const idle = shown.filter((p) => p.total === 0);
  /* Folded away unless they are all there is, or the person is searching. */
  const idleOpen = showIdle || !!find || !active.length;

  const search = projects.length >= SEARCH_FROM && (
    <label className="relative block w-full sm:w-64">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project" aria-label="Find a project"
        className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" />
    </label>
  );

  return (
    <section aria-label="Your projects">
      <SectionTitle hint="Open one to see its rooms" aside={search || undefined}>Your projects</SectionTitle>
      {!projects.length ? (
        <Empty icon={PenTool} title="No projects yet" line="When the studio assigns you to a project, its drawings appear here." />
      ) : !shown.length ? (
        <Card className="px-4 py-6 text-center text-sm text-slate-500">No project matches “{q.trim()}”.</Card>
      ) : (
        <>
          {active.length > 0 && (
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {active.map((p, i) => {
                const pct = Math.round((p.done / p.total) * 100);
                return (
                  <button key={p.id} type="button" onClick={() => onOpen(p.id)} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    className="dd2h-row hud-row-in flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="dd2h-mark shrink-0"><ProjectMark code={p.code} color={p.color} size={40} /></span>
                    <span className="min-w-0 flex-[1_1_240px]">
                      <span className="block truncate text-base font-bold text-slate-800" title={p.name}>{p.name}</span>
                      <span className="block truncate text-sm text-slate-500">{p.client ? `${p.client} · ` : ''}{p.total} drawing{p.total === 1 ? '' : 's'}</span>
                    </span>
                    <span className="w-full shrink-0 sm:w-48">
                      <span className="block text-xs font-semibold text-slate-600">{p.done} of {p.total} approved</span>
                      <span className="dd2h-bar mt-1.5 block h-1.5 rounded-full bg-slate-100" aria-hidden><i className="bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className="flex shrink-0 justify-end sm:w-[132px]">
                      {p.need > 0 ? <Tag tone="you">{p.need} need{p.need === 1 ? 's' : ''} you</Tag> : p.done === p.total ? <Tag tone="good">All approved</Tag> : <Tag>Nothing for you</Tag>}
                    </span>
                    <ChevronRight size={18} className="dd2h-chev ml-auto shrink-0 text-slate-400 sm:ml-0" aria-hidden />
                  </button>
                );
              })}
            </Card>
          )}

          {idle.length > 0 && (
            <div className={active.length ? 'mt-3' : ''}>
              {active.length > 0 && !find && (
                <button type="button" onClick={() => setShowIdle((v) => !v)} aria-expanded={idleOpen}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800">
                  <ChevronDown size={18} aria-hidden className={cx('transition-transform', idleOpen && 'rotate-180')} />
                  {idle.length} project{idle.length === 1 ? '' : 's'} with no drawings yet
                </button>
              )}
              {!active.length && !find && <p className="mb-2 text-sm text-slate-500">None of these has a drawing yet.</p>}
              {idleOpen && (
                <div className={cx('grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3', active.length > 0 && !find && 'mt-1')}>
                  {idle.map((p, i) => (
                    <button key={p.id} type="button" onClick={() => onOpen(p.id)} title={p.name} style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
                      className="dd2h-chip hud-row-in flex min-h-[52px] min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left">
                      <ProjectMark code={p.code} color={p.color} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                        {p.client && <span className="block truncate text-xs text-slate-500">{p.client}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
