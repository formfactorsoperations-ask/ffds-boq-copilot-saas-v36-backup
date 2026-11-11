import React, { useMemo, useState } from 'react';
import { Hammer, MessageCircle, Trophy, FolderOpen, Users, Lock, Eye, EyeOff, Check, X, Plus, ShieldCheck, Loader2 } from '@/lib/lucide-shim';
import { dayKey, addDays } from '../../lib/opsDesk';
import { clientMoneyOf } from '../../lib/clientMoney';
import {
  OPS_ACCESS_KEYS, ACCESS_META, ALWAYS, opsExtrasOf, acceptedProposalOf, endOfDayIST,
  type OpsAccess, type OpsAccessKey, type OpsCover,
} from '../../lib/opsAccess';
import { useDesk, fmtDay } from './DeskBits';
import { Band, Tiles } from './Od2Bits';

/*
  WHO SEES WHAT (Ops Desk 2.1, phase 2). For the Owner and the Ops Director:
  five switches, all off until turned on, for what Client Relations may see
  beyond the client, the work and the dates. Turning one changes what the
  server writes into their copy of each project (lib/opsAccess), so it holds
  in the browser too, not just on screen. Beside them, the same project as
  each side sees it, and cover: a colleague's projects for set days, given
  here and ended by itself.
*/

const ICON: Record<OpsAccessKey, React.ComponentType<any>> = { site: Hammer, messages: MessageCircle, proposal: Trophy, drive: FolderOpen, cover: Users };

export function WhoSeesWhat({ access, covers, people, projectsOf, onAccess, onCovers }: {
  access: OpsAccess;
  covers: OpsCover[];
  /** Client Relations people, who can cover and be covered. */
  people: { email: string; name: string }[];
  projectsOf: (email: string) => string[];
  onAccess: (a: OpsAccess) => Promise<void>;
  onCovers: (c: OpsCover[]) => Promise<void>;
}) {
  const d = useDesk();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(d.projects[0]?.id || '');
  const on = OPS_ACCESS_KEYS.filter((k) => access[k]).length;
  const live = covers.filter((c) => c.until > d.now);

  const flip = async (k: OpsAccessKey) => {
    setBusy(k); setErr(null);
    try { await onAccess({ ...access, [k]: !access[k] }); } catch { setErr('That was not saved. Only the Owner, an Admin or the Ops Director can change this.'); } finally { setBusy(null); }
  };

  return (
    <>
      <Band eyebrow="Who sees what" title="The ops exec sees the client, never the money"
        sub="Five things Client Relations can be given beyond the client, the work and the dates. Each is off until you turn it on. A change reaches their copy of every project within a minute; what is off is never sent to their browser.">
        <Tiles tiles={[
          { count: on, title: 'Turned on', sub: `Of ${OPS_ACCESS_KEYS.length}` },
          { count: live.length, title: 'Cover now', sub: 'Ends by itself' },
          { count: people.length, title: 'Client Relations', sub: 'Who this applies to' },
        ]} />
      </Band>
      {err && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="od-two">
        <div className="flex flex-col gap-3">
          {OPS_ACCESS_KEYS.map((k, i) => {
            const Icon = ICON[k];
            return (
              <div key={k} className={`od-card od-in flex items-center gap-3 ${access[k] ? '' : 'opacity-80'}`} style={{ ['--i' as any]: i }}>
                <span className={`od-tile ${access[k] ? '' : '!bg-slate-100 !text-slate-400'}`}><Icon /></span>
                <div className="min-w-0 flex-1">
                  <b className="text-sm block">{ACCESS_META[k].label}</b>
                  <small className="text-xs text-slate-500">{ACCESS_META[k].why}</small>
                </div>
                <button type="button" role="switch" aria-checked={access[k]} aria-label={ACCESS_META[k].label} disabled={!!busy} onClick={() => flip(k)}
                  className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${access[k] ? 'bg-[#3D52A0]' : 'bg-slate-300'} disabled:opacity-60`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${access[k] ? 'translate-x-4' : ''}`} />
                  {busy === k && <Loader2 className="absolute -right-6 top-1 w-4 h-4 animate-spin text-slate-400" />}
                </button>
              </div>
            );
          })}
          {access.cover && <CoverCard covers={covers} people={people} projectsOf={projectsOf} onCovers={onCovers} />}
        </div>
        <div className="flex flex-col gap-3">
          <Preview access={access} projectId={pick} onPick={setPick} />
          <section className="od-card">
            <div className="od-ch"><span className="od-tile"><Lock /></span><div><h3>Stays as it is</h3><p>Whatever the switches say</p></div></div>
            {ALWAYS.map(([l, ok]) => (
              <div key={l} className={`flex items-center gap-2 py-1.5 text-xs ${ok ? 'text-slate-700' : 'text-slate-400'}`}>
                {ok ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5" />}{l}<span className="ml-auto od-eyebrow">{ok ? 'Sees' : 'Never'}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}

/* The same project, as the ops exec and as the leads see it, following the switches. */
function Preview({ access, projectId, onPick }: { access: OpsAccess; projectId: string; onPick: (id: string) => void }) {
  const d = useDesk();
  const p = d.projects.find((x) => x.id === projectId);
  const raw = p?.raw || {};
  const ex = useMemo(() => opsExtrasOf(raw, access, { link: 'https://drive.google.com/drive/folders/' }), [raw, access]);
  const ctx = raw.context || {};
  const msgs = (ctx.clientMessages || []).length;
  const site = ((raw.activeProject?.executionData?.updates || []).length) + ((raw.activeProject?.executionData?.blockers || []).length);
  const prop = acceptedProposalOf(ctx);
  const money = clientMoneyOf(raw);
  const next = money?.milestones.find((m) => m.status !== 'paid');
  const rows: [string, string, string | null][] = [
    ['Client and stage', `${p?.clientName || 'Client'} · ${p?.status.replace(/_/g, ' ') || ''}`, `${p?.clientName || 'Client'} · ${p?.status.replace(/_/g, ' ') || ''}`],
    ['Site updates', `${site} update${site === 1 ? '' : 's'} and blockers`, ex.siteWork ? `${site} update${site === 1 ? '' : 's'} and blockers` : null],
    ['Portal messages', `${msgs} as written`, ex.portalMessages ? `${msgs}, amounts masked` : null],
    ['Accepted proposal', prop ? `${prop.name}${ctx.proposalAcceptance?.amount ? ' · with its price' : ''}` : 'None yet', ex.acceptedProposal !== undefined ? (prop ? `${prop.name} · no price` : 'None yet') : null],
    ['Drive folder', 'Approved drawings', ex.driveFolder !== undefined ? 'Approved drawings' : null],
    ['Next payment', next ? `${next.name} · with the amount` : '—', next ? `${next.name} · no amount` : '—'],
    ['Agreements, rates and margins', 'Everything', null],
  ];
  return (
    <section className="od-card">
      <div className="od-ch">
        <span className="od-tile"><Eye /></span><div><h3>See it as each side does</h3><p>Follows the switches as you turn them</p></div>
      </div>
      <select className="od-field mb-3" value={projectId} onChange={(e) => onPick(e.target.value)} aria-label="Project">
        {d.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="od-eyebrow">Client Relations</span><span className="od-eyebrow">Ops Director, Owner, Admin</span>
        {rows.map(([label, lead, cr]) => (
          <React.Fragment key={label}>
            <span className={`rounded-lg px-2 py-1.5 ${cr ? 'bg-slate-50 text-slate-700' : 'text-slate-400'}`}>
              <span className="flex items-center gap-1.5 font-semibold">{cr ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5" />}{label}</span>
              <span className="block text-[11px]">{cr || 'Hidden'}</span>
            </span>
            <span className="rounded-lg px-2 py-1.5 bg-[#3D52A0]/5 text-slate-700">
              <span className="flex items-center gap-1.5 font-semibold"><Eye className="w-3.5 h-3.5 text-emerald-600" />{label}</span>
              <span className="block text-[11px]">{lead}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

/* Cover: who covers, for whom, until when, which of their projects. */
function CoverCard({ covers, people, projectsOf, onCovers }: { covers: OpsCover[]; people: { email: string; name: string }[]; projectsOf: (email: string) => string[]; onCovers: (c: OpsCover[]) => Promise<void> }) {
  const d = useDesk();
  const today = dayKey(d.now);
  const [adding, setAdding] = useState(false);
  const [who, setWho] = useState('');
  const [forWhom, setForWhom] = useState('');
  const [until, setUntil] = useState(addDays(today, 1));
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const theirs = forWhom ? projectsOf(forWhom) : [];
  const name = (id: string) => d.projects.find((p) => p.id === id)?.name || 'A project';
  const live = covers.filter((c) => c.until > d.now);
  const chosen = theirs.filter((id) => ticked[id] !== false);

  const save = async (next: OpsCover[]) => {
    setBusy(true); setErr(null);
    try { await onCovers(next); setAdding(false); } catch { setErr('That was not saved. Try again.'); } finally { setBusy(false); }
  };
  const give = () => {
    const a = people.find((x) => x.email === who), b = people.find((x) => x.email === forWhom);
    if (!a || !b || !chosen.length) return;
    void save([...live, {
      id: `c${Date.now().toString(36)}`, email: a.email, name: a.name, forEmail: b.email, forName: b.name, projectIds: chosen,
      until: endOfDayIST(until), by: d.me.email, byName: d.me.name, at: Date.now(),
    }]);
  };

  return (
    <section className="od-card od-rise">
      <div className="od-ch">
        <span className="od-tile"><ShieldCheck /></span>
        <div><h3>Cover now</h3><p>Their projects, worked as their own, until the end of the day you pick. It ends by itself.</p></div>
        {!adding && <div className="od-r"><button type="button" className="od-btn sm pri" onClick={() => setAdding(true)} disabled={people.length < 2}><Plus />Give cover</button></div>}
      </div>
      {!live.length && !adding && <div className="od-empty2">{people.length < 2 ? 'Cover needs two Client Relations people on the team.' : 'Nobody is covering anyone.'}</div>}
      {live.map((c) => (
        <div key={c.id} className="od-dec">
          <span className="od-dot good" />
          <div className="od-who"><b>{c.name} covers {c.forName}</b><small>{c.projectIds.length} project{c.projectIds.length === 1 ? '' : 's'} · until {fmtDay(dayKey(c.until))} · given by {c.byName || c.by}</small></div>
          <button type="button" className="od-btn sm" disabled={busy} onClick={() => save(live.filter((x) => x.id !== c.id))}><X />End now</button>
        </div>
      ))}
      {adding && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1"><span className="od-eyebrow">Who covers</span>
              <select className="od-field" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Choose</option>{people.filter((x) => x.email !== forWhom).map((x) => <option key={x.email} value={x.email}>{x.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className="od-eyebrow">For</span>
              <select className="od-field" value={forWhom} onChange={(e) => { setForWhom(e.target.value); setTicked({}); }}>
                <option value="">Choose</option>{people.filter((x) => x.email !== who).map((x) => <option key={x.email} value={x.email}>{x.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className="od-eyebrow">Until the end of</span>
              <input type="date" className="od-field" value={until} min={today} max={addDays(today, 60)} onChange={(e) => setUntil(e.target.value)} /></label>
          </div>
          {forWhom && (
            !theirs.length ? <div className="od-empty2">No projects are assigned to them.</div> : (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {theirs.map((id) => (
                  <label key={id} className="flex items-center gap-2.5 px-3 min-h-[40px] text-sm">
                    <input type="checkbox" className="w-4 h-4 accent-[#3D52A0]" checked={ticked[id] !== false} onChange={(e) => setTicked((t) => ({ ...t, [id]: e.target.checked }))} />{name(id)}
                  </label>
                ))}
              </div>
            )
          )}
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <div className="od-acts !mt-0">
            <button type="button" className="od-btn pri" disabled={busy || !who || !forWhom || !chosen.length || !until} onClick={give}>{busy ? <Loader2 className="animate-spin" /> : <Check />}Give cover{chosen.length ? ` · ${chosen.length}` : ''}</button>
            <button type="button" className="od-btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

