import React from 'react';
import { Search, X, Users } from '@/lib/lucide-shim';
import { Chip, EmptyState, Segmented } from '../ui/kit';
import { STAGE, stageOfProject } from '../../lib/projectFolders';
import { hasNewActivity, type ClientFilter, type ClientRow, type SeenMarks } from '../../lib/clientList';
import { ClientPhoto, whenShort } from './parts';

/*
  The list pane (DESIGN.md "Clients: conversations"): search, then All / New
  activity / Owes us / Quiet with no counts, then one row per client.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export default function ClientList({ rows, selected, onSelect, query, onQuery, filter, onFilter, marks, amountsHidden, now, emptyText }: {
  rows: ClientRow[];
  selected: string | null;
  onSelect: (key: string) => void;
  query: string;
  onQuery: (q: string) => void;
  filter: ClientFilter;
  onFilter: (f: ClientFilter) => void;
  marks: SeenMarks;
  amountsHidden: boolean;
  now: number;
  emptyText: string;
}) {
  const options: { id: ClientFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New activity' },
    ...(amountsHidden ? [] : [{ id: 'owes' as const, label: 'Owes us' }]),
    { id: 'quiet', label: 'Quiet' },
  ];
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 space-y-2.5 border-b border-slate-100">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus-within:ring-2 focus-within:ring-[#3D52A0]/30 focus-within:border-[#3D52A0]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search clients, places or projects"
            aria-label="Search clients, places or projects" className="flex-1 min-w-0 outline-none bg-transparent text-slate-800 placeholder:text-slate-400" />
          {query && (
            <button type="button" onClick={() => onQuery('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          )}
        </label>
        <Segmented<ClientFilter> label="Show clients" size="sm" value={filter} onChange={onFilter} options={options} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto" role="listbox" aria-label="Clients">
        {rows.length === 0 ? (
          <div className="p-3"><EmptyState icon={Users} title="No clients here" text={emptyText} /></div>
        ) : rows.map((r, i) => {
          const c = r.client;
          const on = c.clientKey === selected;
          const fresh = hasNewActivity(r, marks);
          const stage = STAGE[stageOfProject(r.primary)];
          return (
            <button key={c.clientKey} type="button" role="option" aria-selected={on} onClick={() => onSelect(c.clientKey)}
              className={cx(
                'w-full text-left flex items-start gap-3 px-3.5 py-3 border-l-[3px] border-b border-b-slate-100 transition-colors hud-row-in',
                on ? 'border-l-[#3D52A0] bg-[#3D52A0]/5' : 'border-l-transparent hover:bg-slate-50',
              )}
              style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
              <ClientPhoto project={r.primary} className="w-10 h-10 rounded-full overflow-hidden" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-slate-800 truncate flex-1">{c.clientName}</span>
                  {r.lastContactAt != null && <span className="text-[11px] text-slate-400 shrink-0">{whenShort(r.lastContactAt, now)}</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="text-xs text-slate-500 truncate flex-1">
                    {r.preview
                      ? <>{r.preview.who === 'you' ? 'You: ' : 'Logged: '}{r.preview.text}</>
                      : <>{stage.label} · {r.primary?.context?.name || 'Untitled project'}</>}
                  </span>
                  {!r.money.hidden && r.money.owes && <Chip tone="bad" title="An invoice is raised and not yet paid">₹ Owes</Chip>}
                  {fresh && <span className="w-2.5 h-2.5 rounded-full bg-[#3D52A0] shrink-0" title="New from the client since you last looked" aria-label="New activity" />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
