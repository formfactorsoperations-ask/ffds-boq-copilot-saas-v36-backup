import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronDown, Circle, Eye, History, Layers, LayoutGrid, Search, Star, Undo2 } from 'lucide-react';
import { switcherGroups, type Stats } from '../../lib/designDesk';
import { ProjectMark, TONE, type Tone } from './DeskParts';

/*
  WHICH PROJECT AM I IN.

  One band, in the project's own colour, says where you are and how it
  stands. Its name opens a searchable switcher: pinned projects, then the
  ones waiting on you, then the rest by when you last opened them. The last
  few projects sit underneath as one-click chips. Any number of projects
  fits without the page scrolling sideways.
*/

export interface ProjectInfo {
  id: string;
  name: string;
  client?: string;
  code: string;
  color: string;
  soft: string;
  stats: Stats;
  /** Sheets in this project that need the viewer. */
  need: number;
}

interface Props {
  current: string;
  projects: ProjectInfo[];
  allStats: Stats;
  allNeed: number;
  reviewer: boolean;
  pinned: string[];
  recent: string[];
  onPick: (id: string) => void;
  onTogglePin: (id: string) => void;
  /** When the counts for every project come only from sheets that have a PDF. */
  partial?: boolean;
}

const pct = (s: Stats) => (s.total ? Math.round((s.approved / s.total) * 100) : 0);

export default function ProjectBand({ current, projects, allStats, allNeed, reviewer, pinned, recent, onPick, onTogglePin, partial }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const isAll = current === 'all';
  const p = projects.find((x) => x.id === current) || null;
  const waitWord = reviewer ? 'waiting for you' : 'need you';

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => search.current?.focus(), 20);
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', away); };
  }, [open]);

  const pick = (id: string) => { onPick(id); setOpen(false); setQ(''); };
  const byId = useMemo(() => new Map(projects.map((x) => [x.id, x])), [projects]);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? projects.filter((x) => `${x.name} ${x.client || ''} ${x.code}`.toLowerCase().includes(t)) : null;
  }, [projects, q]);
  const groups = useMemo(() => {
    if (found) return found.length ? [{ title: `${found.length} found`, icon: Search, ids: found.map((x) => x.id) }] : [];
    const g = switcherGroups(projects.map((x) => x.id), { pinned, recent, need: (id) => byId.get(id)?.need || 0 });
    return [
      { title: 'Pinned', icon: Star, ids: g.pinned },
      { title: reviewer ? 'Waiting for you' : 'Needs you', icon: Bell, ids: g.needs },
      { title: 'Everything else', icon: Layers, ids: g.rest },
    ].filter((x) => x.ids.length);
  }, [found, projects, pinned, recent, byId, reviewer]);
  const jump = recent.filter((id) => id !== current && byId.has(id)).slice(0, 3).map((id) => byId.get(id)!);

  const stats = isAll ? allStats : p?.stats;
  const color = isAll || !p ? '#2B2E35' : p.color;
  const soft = isAll || !p ? '#FFFFFF' : p.soft;
  const statChips: [string, number, Tone, typeof Eye][] = stats ? [
    ['In review', stats.review, 'indigo', Eye],
    ['Changes', stats.changes, 'amber', Undo2],
    ['Not sent', stats.draft + stats.none, 'grey', Circle],
  ] : [];

  return (
    <div ref={box} className="relative z-20 mb-[18px] rounded-[18px] border bg-white" style={{ borderColor: isAll || !p ? '#E4E4DE' : `${color}40` }}>
      <div className="h-[5px] rounded-t-[17px]" style={{ background: color }} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5 px-5 py-4" style={{ background: soft, borderRadius: jump.length ? 0 : '0 0 17px 17px' }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
          aria-label={`Switch project. Now ${isAll ? 'all projects' : p?.name || ''}`}
          className="-my-1.5 -ml-1.5 flex min-w-0 flex-[1_1_300px] items-center gap-3.5 rounded-2xl py-1.5 pl-1.5 pr-3 text-left transition hover:bg-black/5">
          {isAll || !p
            ? <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] text-white" style={{ background: color }} aria-hidden><LayoutGrid size={24} /></span>
            : <ProjectMark code={p.code} color={p.color} size={52} />}
          <span className="block min-w-0">
            <span className="block text-[11px] font-extrabold uppercase tracking-[.09em]" style={{ color }}>{isAll ? 'Looking across' : 'Working in'}</span>
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="truncate font-display text-[26px] font-semibold leading-tight text-[#17191E]">{isAll ? 'All projects' : p?.name || 'Choose a project'}</span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(23,25,30,0.12)] transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
                <ChevronDown size={14} strokeWidth={2.6} />
              </span>
            </span>
            <span className="block truncate text-[13px] text-[#5F636D]">
              {isAll ? `${projects.length} project${projects.length === 1 ? '' : 's'} · ${allNeed ? `${allNeed} ${waitWord}` : 'nothing waiting'}` : p?.client || ' '}
            </span>
          </span>
        </button>

        {stats && (
          <div className="min-w-[200px] flex-[0_1_260px]">
            <div className="mb-1.5 flex justify-between text-[12.5px] font-bold text-[#17191E]">
              <span>{stats.approved} of {stats.total} {isAll && partial ? 'uploaded ' : ''}sheets approved</span>
              <span className="text-[#5F636D]">{pct(stats)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: isAll ? '#EEEEEA' : '#fff' }}>
              <i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct(stats)}%`, background: color }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {statChips.map(([label, n, tone, Icon]) => (
            <span key={label} className="inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-white py-0 pl-1.5 pr-3 text-[12.5px] font-bold shadow-[0_0_0_1px_rgba(23,25,30,0.06)]" title={label}>
              <span className="grid h-[26px] w-[26px] place-items-center rounded-lg" style={{ background: TONE[tone].bg, color: TONE[tone].ink }}><Icon size={14} strokeWidth={2.2} /></span>
              <span className="text-[14px] text-[#17191E]">{n}</span><span className="font-semibold text-[#5F636D]">{label}</span>
            </span>
          ))}
        </div>
      </div>

      {jump.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-b-[17px] border-t border-[#EEEEEA] bg-white px-5 pb-3 pt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#5F636D]"><History size={14} />Jump back to</span>
          {jump.map((x) => (
            <button key={x.id} type="button" onClick={() => pick(x.id)} title={`${x.client ? `${x.client} · ` : ''}${x.need ? `${x.need} ${waitWord}` : 'nothing waiting'}`}
              className="inline-flex min-h-[36px] max-w-[240px] items-center gap-2 rounded-full border border-[#DCDCD5] bg-white py-0 pl-1 pr-3 text-[12.5px] font-bold text-[#17191E] transition hover:border-[#A9AAA2]">
              <ProjectMark code={x.code} color={x.color} size={26} round />
              <span className="truncate">{x.name}</span>
              {x.need > 0 && <span className="rounded-full bg-[#ECEDFB] px-1.5 text-[11px] text-[#3A3FB8]">{x.need}</span>}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] hover:text-[#17191E]">
            <Search size={14} strokeWidth={2.4} />All {projects.length} projects
          </button>
        </div>
      )}

      {open && (
        <div className="dd-pop absolute left-2.5 top-[96px] z-40 w-[min(460px,calc(100vw-52px))] overflow-hidden rounded-[18px] border border-[#E4E4DE] bg-white shadow-[0_30px_70px_-24px_rgba(23,25,30,0.5)]" role="dialog" aria-label="Switch project">
          <div className="px-3 pb-2 pt-3">
            <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[#DCDCD5] bg-white px-3 text-[#6B6F78] focus-within:border-[#4146C8] focus-within:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]">
              <Search size={17} />
              <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project, client or area" aria-label="Find a project"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQ(''); }
                  if (e.key === 'Enter') { e.preventDefault(); const first = groups[0]?.ids[0]; if (first) pick(first); }
                }}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-[#17191E] outline-none placeholder:text-[#8A8E97]" />
              <span className="whitespace-nowrap text-[11px] font-bold text-[#8A8E97]">Enter to open</span>
            </label>
          </div>
          <div className="max-h-[360px] overflow-y-auto px-2 pb-2">
            {groups.map((g) => (
              <div key={g.title} className="pt-1.5">
                <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-extrabold uppercase tracking-[.09em] text-[#5F636D]"><g.icon size={13} strokeWidth={2.4} />{g.title}</div>
                {g.ids.map((id) => {
                  const x = byId.get(id)!;
                  const on = id === current;
                  const pinnedNow = pinned.includes(id);
                  return (
                    <div key={id} className={`flex items-center gap-0.5 rounded-xl transition ${on ? 'bg-[#F1F1EC]' : 'hover:bg-[#F6F6F2]'}`}>
                      <button type="button" onClick={() => pick(id)} aria-current={on} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left">
                        <ProjectMark code={x.code} color={x.color} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-[#17191E]"><span className="truncate">{x.name}</span>{on && <Check size={15} strokeWidth={2.8} className="shrink-0 text-[#1F7A57]" />}</span>
                          {x.client && <span className="block truncate text-[12px] text-[#5F636D]">{x.client}</span>}
                        </span>
                        <span className="w-14 shrink-0" title={`${x.stats.approved} of ${x.stats.total} approved`}>
                          <span className="block h-[5px] overflow-hidden rounded-full bg-[#EEEEEA]"><i className="block h-full" style={{ width: `${pct(x.stats)}%`, background: x.color }} /></span>
                          <span className="mt-0.5 block text-right text-[11px] font-bold text-[#5F636D]">{x.stats.approved}/{x.stats.total}</span>
                        </span>
                        <span className="flex w-9 shrink-0 justify-end">{x.need > 0 && <span className="rounded-full bg-[#ECEDFB] px-2 py-0.5 text-[12px] font-bold text-[#3A3FB8]" title={waitWord}>{x.need}</span>}</span>
                      </button>
                      <button type="button" onClick={() => onTogglePin(id)} aria-pressed={pinnedNow} aria-label={pinnedNow ? `Unpin ${x.name}` : `Pin ${x.name} to the top`} title={pinnedNow ? 'Unpin' : 'Pin to the top'}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] hover:bg-[#EBEBE5]" style={{ color: pinnedNow ? '#C48A00' : '#9A9DA5' }}>
                        <Star size={17} fill={pinnedNow ? '#E5A50A' : 'none'} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {found && !found.length && <div className="px-2 py-6 text-center text-[13px] text-[#5F636D]">No project matches “{q}”.</div>}
          </div>
          <div className="border-t border-[#EEEEEA] bg-[#FAFAF7] p-2">
            <button type="button" onClick={() => pick('all')} aria-current={isAll} className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl p-2 text-left ${isAll ? 'bg-[#F1F1EC]' : 'hover:bg-[#F1F1EC]'}`}>
              <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-[#2B2E35] text-white"><LayoutGrid size={15} /></span>
              <span className="flex-1 font-extrabold text-[#17191E]">All projects</span>
              <span className="text-[12px] font-bold text-[#5F636D]">{allNeed ? `${allNeed} ${reviewer ? 'waiting' : 'need you'}` : `${allStats.total} sheets`}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
