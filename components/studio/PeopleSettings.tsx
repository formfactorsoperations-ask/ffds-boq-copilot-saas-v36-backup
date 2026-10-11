import React, { useMemo, useState } from 'react';
import { Check, Plus, X, MapPin, Crosshair, ChevronDown } from '@/lib/lucide-shim';
import {
  LEAVE_LABELS, businessDate, fiscalYear, peopleOf, policyOf,
  type LeaveType, type MemberSettings, type PeopleSettings,
} from '../../lib/peopleDesk';
import { CountUp, Dot } from '../ui/HudBits';

/*
  Studio settings → People (lib/peopleDesk.ts): the working day, leave
  allowances, holidays, where the office is for check-in, and who reports to
  whom. Saved with the rest of the studio record by the settings screen.
  Everyone on Team & roles who is not a client or vendor is on attendance
  unless left out here; Owners and Admins run People.
*/

const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const small = 'px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const btnSm = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CHARGED: LeaveType[] = ['PL', 'SL', 'CL', 'COMP'];
const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const Toggle: React.FC<{ on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, disabled, onChange, label: aria }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={aria} disabled={disabled} onClick={() => onChange(!on)}
    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-50 ${on ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[26px]' : 'left-0.5'}`} />
  </button>
);

const Block: React.FC<{ title: string; sub: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ title, sub, children, aside }) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className={label}>{title}</p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
      {aside}
    </div>
    {children}
  </section>
);

export default function PeopleSettings({ org, canEdit, onChange }: {
  org: any;
  canEdit: boolean;
  onChange: (next: PeopleSettings) => void;
}) {
  const raw: PeopleSettings = org?.peopleDesk || {};
  const rawPolicy: any = raw.policy || {};
  const members: Record<string, MemberSettings> = raw.members || {};
  const policy = useMemo(() => policyOf(org), [org]);
  const people = useMemo(() => peopleOf(org), [org]);
  const fy = fiscalYear(businessDate(new Date()), policy);

  const setPolicy = (patch: Record<string, unknown>) => onChange({ ...raw, policy: { ...rawPolicy, ...patch } });
  const setMember = (id: string, patch: Partial<MemberSettings>) => onChange({ ...raw, members: { ...members, [id]: { ...members[id], ...patch } } });

  /* Holidays */
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const addHoliday = () => {
    if (!hDate) return;
    setPolicy({
      holidays: [...new Set([...policy.holidays, hDate])].sort(),
      holidayNames: { ...(rawPolicy.holidayNames || {}), [hDate]: hName.trim().slice(0, 80) },
    });
    setHDate('');
    setHName('');
  };
  const removeHoliday = (d: string) => {
    const names = { ...(rawPolicy.holidayNames || {}) };
    delete names[d];
    setPolicy({ holidays: policy.holidays.filter((x) => x !== d), holidayNames: names });
  };
  const thisYear = policy.holidays.filter((d) => fiscalYear(d, policy) === fy);

  /* Office location */
  const office = rawPolicy.office || {};
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const useHere = () => {
    setLocError(null);
    if (!navigator.geolocation) { setLocError('This browser cannot share a location.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPolicy({ office: { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, radiusM: Number(office.radiusM) || 150 } });
      },
      () => { setLocating(false); setLocError('Location is blocked. Allow it for this site, or type the coordinates.'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const setOffice = (k: 'lat' | 'lng' | 'radiusM', v: string) => setPolicy({ office: { ...office, [k]: v === '' ? '' : Number(v) } });

  /* People */
  const [open, setOpen] = useState<string | null>(null);
  const runs = people.filter((p) => p.accessRole === 'admin').length;
  const onAttendance = people.filter((p) => p.active).length;
  const managers = people.filter((p) => people.some((x) => x.managerId === p.id)).length;
  const ACCESS: Record<string, string> = { admin: 'Runs People', ops: 'Reviews all', manager: 'Manager', employee: 'Team member' };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['On attendance', onAttendance], ['Run People', runs], ['Have reports', managers], [`Holidays FY ${fy}–${String(Number(fy) + 1).slice(2)}`, thisYear.length],
        ] as [string, number][]).map(([k, v], i) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
            <p className={label}>{k}</p>
            <p className="text-sm font-black text-slate-800 tabular-nums mt-1"><CountUp value={v} /></p>
          </div>
        ))}
      </div>

      <Block title="The working day" sub="Check-ins after the late cutoff are marked late. Weekly offs and holidays are never charged as leave.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([['start', 'Starts'], ['lateAfter', 'Late after'], ['end', 'Ends']] as const).map(([k, l]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className={label}>{l}</span>
              <input type="time" className={field} disabled={!canEdit} value={policy[k]} onChange={(e) => setPolicy({ [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAYS.map((d, i) => {
            const on = policy.weeklyOffDays.includes(i);
            return (
              <button key={d} type="button" disabled={!canEdit} aria-pressed={on}
                onClick={() => setPolicy({ weeklyOffDays: on ? policy.weeklyOffDays.filter((x) => x !== i) : [...policy.weeklyOffDays, i].sort() })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors hud-row-in ${on ? 'border-[#3D52A0] bg-[#3D52A0] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-60`}
                style={{ animationDelay: `${i * 30}ms` }}>
                {on ? <Check className="w-3.5 h-3.5" /> : null}{d} off
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">2nd and 4th Sunday off</p>
            <p className="text-xs text-slate-500">On top of the weekly offs above.</p>
          </div>
          <Toggle label="2nd and 4th Sunday off" on={policy.alternateSundays} disabled={!canEdit} onChange={(v) => setPolicy({ alternateSundays: v })} />
        </div>
      </Block>

      <Block title="Leave allowances" sub={`Each person's yearly allowance, unless set for them below. No carry-forward: each leave year starts afresh.`}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {CHARGED.map((t) => (
            <label key={t} className="flex flex-col gap-1.5">
              <span className={label}>{LEAVE_LABELS[t]}</span>
              <span className="flex items-center gap-2"><input type="number" min={0} max={365} step={0.5} className={`${small} w-20`} disabled={!canEdit}
                value={policy.allowances[t]} onChange={(e) => setPolicy({ allowances: { ...policy.allowances, [t]: Number(e.target.value) } })} />
                <span className="text-xs text-slate-500">days</span></span>
            </label>
          ))}
          <label className="flex flex-col gap-1.5">
            <span className={label}>Leave year starts</span>
            <select className={field} disabled={!canEdit} value={policy.fiscalStartMonth} onChange={(e) => setPolicy({ fiscalStartMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-500">Work from home needs approval but is not counted against an allowance. Comp-off is granted to a person below.</p>
      </Block>

      <Block title="Holidays" sub="Studio holidays are skipped when leave is counted, and shown on the team calendar."
        aside={<span className="text-[11px] text-slate-500"><span className="font-black text-slate-800 tabular-nums"><CountUp value={thisYear.length} /></span> this leave year</span>}>
        {canEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr_auto] gap-2">
            <input type="date" aria-label="Holiday date" className={field} value={hDate} onChange={(e) => setHDate(e.target.value)} />
            <input aria-label="Holiday name" className={field} maxLength={80} placeholder="e.g. Diwali" value={hName} onChange={(e) => setHName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(); } }} />
            <button type="button" className={btnSm} disabled={!hDate} onClick={addHoliday}><Plus className="w-3.5 h-3.5" />Add holiday</button>
          </div>
        )}
        {policy.holidays.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">No holidays yet. Add this year's studio holidays.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {policy.holidays.map((d, i) => (
              <div key={d} className="flex items-center gap-3 px-3 py-2 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <span className="text-sm font-semibold text-slate-800 w-40 shrink-0 tabular-nums">{niceDay(d)}</span>
                <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{policy.holidayNames?.[d] || 'Holiday'}</span>
                {canEdit && <button type="button" aria-label={`Remove ${d}`} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => removeHoliday(d)}><X className="w-3.5 h-3.5" /></button>}
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block title="Check-in location" sub="Office and site check-ins record where the person was and how far from the office. Work from home never records a location.">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Ask for a location at office and site check-ins</p>
            <p className="text-xs text-slate-500">The person's browser asks to share their location. It is a record, not proof.</p>
          </div>
          <Toggle label="Ask for a location" on={policy.requireLocation} disabled={!canEdit} onChange={(v) => setPolicy({ requireLocation: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_auto] gap-3 items-end">
          <label className="flex flex-col gap-1.5"><span className={label}>Office latitude</span>
            <input type="number" step="0.000001" className={field} disabled={!canEdit} value={office.lat ?? ''} placeholder="19.218300" onChange={(e) => setOffice('lat', e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className={label}>Office longitude</span>
            <input type="number" step="0.000001" className={field} disabled={!canEdit} value={office.lng ?? ''} placeholder="72.978100" onChange={(e) => setOffice('lng', e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className={label}>Counts as office within</span>
            <span className="flex items-center gap-2"><input type="number" min={20} max={5000} className={`${small} w-20`} disabled={!canEdit} value={office.radiusM ?? 150} onChange={(e) => setOffice('radiusM', e.target.value)} /><span className="text-xs text-slate-500">m</span></span></label>
          {canEdit && <button type="button" className={btnSm} disabled={locating} onClick={useHere}><Crosshair className="w-3.5 h-3.5" />{locating ? 'Locating…' : 'Use where I am'}</button>}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {policy.office ? (
            <><Dot tone="ok" />Office set.
              <a className="inline-flex items-center gap-1 font-semibold text-[#3D52A0] hover:underline" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps?q=${policy.office.lat},${policy.office.lng}`}><MapPin className="w-3 h-3" />Check it on Google Maps</a></>
          ) : (
            <><Dot tone="warn" />No office yet: locations are recorded, but not measured against the office. Stand in the studio and press Use where I am.</>
          )}
        </p>
        {locError && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{locError}</p>}
      </Block>

      <Block title="People and who they report to" sub="Everyone on Team & roles except clients and vendors. A manager approves their reports' leave; Owners and Admins can approve anyone's but their own.">
        {people.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">Add your team in Team & roles first.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {people.map((p, i) => {
              const m = members[p.id] || {};
              const expanded = open === p.id;
              const reports = people.filter((x) => x.managerId === p.id).length;
              const own = m.entitlements?.[fy] || {};
              return (
                <div key={p.id} className={`hud-row-in ${p.active ? '' : 'opacity-60'}`} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center text-xs font-black">{p.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{p.title || 'Team'} · {ACCESS[p.accessRole]}{reports ? ` · ${reports} report${reports === 1 ? '' : 's'}` : ''}</p>
                    </div>
                    <label className="flex items-center gap-2">
                      <span className={label}>Reports to</span>
                      <select aria-label={`${p.name} reports to`} disabled={!canEdit || !p.active}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 disabled:bg-slate-50 max-w-[170px]"
                        value={m.managerId || ''} onChange={(e) => setMember(p.id, { managerId: e.target.value || undefined })}>
                        <option value="">Nobody</option>
                        {people.filter((x) => x.id !== p.id && x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                    <button type="button" className={btnSm} onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded}>
                      More<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 pl-14 flex flex-col gap-3 hud-row-in">
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                        <p className="text-sm font-semibold text-slate-800">On attendance and leave</p>
                        <Toggle label={`${p.name} on attendance`} on={!m.excluded} disabled={!canEdit} onChange={(v) => setMember(p.id, { excluded: !v || undefined })} />
                      </div>
                      <div>
                        <p className={label}>Allowance for FY {fy}–{String(Number(fy) + 1).slice(2)}, if different</p>
                        <div className="flex flex-wrap gap-3 mt-1.5">
                          {CHARGED.map((t) => (
                            <label key={t} className="flex items-center gap-2 text-xs text-slate-500">{t}
                              <input type="number" min={0} max={365} step={0.5} className={`${small} w-20`} disabled={!canEdit} placeholder={String(policy.allowances[t])}
                                value={own[t] ?? ''} onChange={(e) => {
                                  const next = { ...own } as Partial<Record<LeaveType, number>>;
                                  if (e.target.value === '') delete next[t]; else next[t] = Number(e.target.value);
                                  setMember(p.id, { entitlements: { ...(m.entitlements || {}), [fy]: next } });
                                }} />
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1.5">
                        <span className={label}>Daily update folder (optional)</span>
                        <input className={field} disabled={!canEdit} maxLength={2048} placeholder="https://drive.google.com/drive/folders/…" value={m.dailyUpdateUrl || ''}
                          onChange={(e) => setMember(p.id, { dailyUpdateUrl: e.target.value.trim() || undefined })} />
                        <span className="text-[11px] text-slate-500">A Google Drive or Docs link. They are reminded of it, never made to open it, when they check out.</span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Block>
    </div>
  );
}
