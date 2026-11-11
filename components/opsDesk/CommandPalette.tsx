import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Layers, UserPlus, Plus, Mic, Flag, Target, Moon, CalendarCheck, ArrowRight, Sparkles,
} from '@/lib/lucide-shim';
import { leadName, homeLine, LEAD_STAGES } from '../../lib/leads';
import { HEALTH_LABEL } from '../../lib/opsDesk2';
import { useDesk, type Section } from './DeskBits';
import './od2Styles';

/*
  CTRL K (Ops Desk 2.1): find any client or lead, open any part of the desk,
  or do something. Typing a sentence that names a client offers to log it as
  a follow-up on that client, with the sentence as what was said. The arrow
  keys move, Enter runs, Escape closes. Ctrl K or / opens it from anywhere on
  the desk.
*/

interface Item { group: string; label: string; sub?: string; icon: React.ComponentType<any>; run: () => void; key: string }

export function CommandPalette({ sections, onClose }: { sections: { id: Section; label: string; icon: React.ComponentType<any> }[]; onClose: () => void }) {
  const d = useDesk();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase();
    const has = (...s: (string | undefined)[]) => !t || s.filter(Boolean).join(' ').toLowerCase().includes(t);
    const run = (f: () => void) => () => { onClose(); f(); };
    const out: Item[] = [];
    d.clients.filter((c) => has(c.name, c.client, c.line)).slice(0, t ? 8 : 5).forEach((c) => out.push({
      key: `c:${c.id}`, group: 'Clients', label: `${c.name}${c.client ? ` · ${c.client}` : ''}`, sub: `${c.phase.line} · ${HEALTH_LABEL[c.health]}`, icon: Layers, run: run(() => d.act.openClient(c.id)),
    }));
    d.leads.filter((l) => has(leadName(l), homeLine(l.home), ...(l.people || []).map((p) => `${p.name} ${p.phone}`))).slice(0, t ? 6 : 3).forEach((l) => out.push({
      key: `l:${l.id}`, group: 'Leads', label: leadName(l), sub: [homeLine(l.home), LEAD_STAGES.find((s) => s.id === l.stage)?.label].filter(Boolean).join(' · '), icon: UserPlus, run: run(() => d.act.openLead(l.id)),
    }));
    if (d.canWrite) {
      /* A sentence that names a client: log it on that client. */
      if (t.length > 12) {
        const named = d.clients.find((c) => [c.name, c.client].some((n) => n && n.length > 2 && t.includes(n.toLowerCase().replace(/^(mr|mrs|ms|dr)\.?\s+/, ''))));
        out.push({
          key: 'say', group: 'Do', label: named ? `Log on ${named.name}: “${q.trim()}”` : `Log a follow-up: “${q.trim()}”`, sub: 'Opens the log with this as what was said',
          icon: Sparkles, run: run(() => d.act.log({ projectId: named?.id, note: q.trim() })),
        });
      }
      const acts: [string, React.ComponentType<any>, () => void, string?][] = [
        ['Log a follow-up', Plus, () => d.act.log({})],
        ['Add a lead', UserPlus, d.act.addLead],
        ['Capture a chat or call', Mic, d.act.capture],
        ['Raise an escalation', Flag, () => d.act.escalate({})],
        ['Book a meeting or visit', CalendarCheck, () => d.act.bookVisit('')],
        ['Start focus mode', Target, d.act.focus, 'F'],
        ...(!d.isLead ? [['Close my day', Moon, d.act.closeDay] as [string, React.ComponentType<any>, () => void]] : []),
      ];
      acts.filter(([l]) => has(l)).forEach(([label, icon, f, k]) => out.push({ key: `a:${label}`, group: 'Do', label, sub: k, icon, run: run(f) }));
    }
    sections.filter((s) => has(s.label, 'go open')).forEach((s) => out.push({ key: `s:${s.id}`, group: 'Go to', label: s.label, icon: s.icon, run: run(() => d.act.go(s.id)) }));
    return out;
  }, [q, d, sections, onClose]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let group = '';
  return (
    <div className="od-ov">
      <div className="od-scrim" onClick={onClose} aria-hidden />
      <div className="od-pal" role="dialog" aria-modal="true" aria-label="Search or run a command">
        <div className="od-pal-in">
          <Search />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Find a client or lead, or say what to do…"
            aria-label="Search or run a command" role="combobox" aria-expanded aria-controls="od-pal-list" aria-activedescendant={items[sel] ? `od-pi-${sel}` : undefined} />
          <kbd className="od-kbd">Esc</kbd>
        </div>
        <div className="od-pal-list" id="od-pal-list" role="listbox" ref={list}>
          {!items.length && <p className="od-pal-empty">Nothing matches “{q}”.</p>}
          {items.map((it, i) => {
            const head = it.group !== group ? (group = it.group) : null;
            const Icon = it.icon;
            return (
              <React.Fragment key={it.key}>
                {head && <h6>{head}</h6>}
                <button type="button" id={`od-pi-${i}`} role="option" aria-selected={i === sel} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={it.run}>
                  <span className="od-tile"><Icon /></span><span className="od-pl">{it.label}</span>{it.sub && <small>{it.sub}</small>}
                  {i === sel && <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[#3D52A0]" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="od-pal-foot"><span><kbd className="od-kbd">↑</kbd> <kbd className="od-kbd">↓</kbd> move</span><span><kbd className="od-kbd">Enter</kbd> open</span><span><kbd className="od-kbd">Ctrl K</kbd> or <kbd className="od-kbd">/</kbd> from anywhere on the desk</span></div>
      </div>
    </div>
  );
}
