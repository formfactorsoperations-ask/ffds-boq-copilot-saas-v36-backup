import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Wifi, MapPin, Clock, Printer, Wrench, Siren, Pencil, Eye, EyeOff, Plus, X, Check, RefreshCw } from '@/lib/lucide-shim';
import { clock12, monthlyOffLabel, type Policy } from '../../lib/peopleDesk';
import { NO_ESSENTIALS, daysBetween, type Essentials, type GuideView } from '../../lib/peopleGuide';
import { runGuide } from '../../services/peopleGuideService';
import { Sheet, Label, input, btnPri, btnSec, btnSm } from '../opsDesk/OpsDeskPanels';
import { Panel, Empty, Notice, Skeleton, IconTile, listV, rowV } from './PeopleBits';
import { CopyButton, chip, niceDay, telHref } from './GuideBits';

/*
  OFFICE ESSENTIALS (lib/peopleGuide.ts; approved mockup B, 27 Oct 2026).

  What everyone asks on their first day, and again a month later: the Wi-Fi,
  the studio's address, the hours, the printers, who to call for repairs and
  in an emergency. The hours come straight from the People policy, so they
  never go stale. Admins edit the rest.
*/

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* A time in the policy ("HH:MM", India time), on the 12-hour clock. */
const hm = (t: string) => clock12(t);

function offDays(policy: Policy): string {
  const weekly = policy.weeklyOffDays.map((d) => `${WEEKDAYS[d]}s`);
  const monthly = monthlyOffLabel(policy);
  return [weekly.join(' and '), monthly && `the ${monthly} of each month`].filter(Boolean).join(', and ');
}

export function EssentialsSection({ view, policy, error, onRefresh }: { view: GuideView | null; policy: Policy; error: string | null; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);
  if (!view) {
    return (
      <Panel icon={Building2} title="Office essentials" blurb="The things everyone asks on their first day.">
        {error ? <Empty icon={Building2} text={error}><button type="button" className={btnSec} onClick={onRefresh}><RefreshCw className="w-4 h-4" />Try again</button></Empty>
          : <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>}
      </Panel>
    );
  }
  const e = view.essentials;
  const next = policy.holidays.find((d) => d >= view.today);
  const tile = 'group relative rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 flex flex-col gap-2.5 pp-lift';
  const head = (icon: React.ComponentType<any>, title: string, tone: 'brand' | 'bad' = 'brand') => (
    <span className="flex items-center gap-2.5"><IconTile icon={icon} size="sm" tone={tone} /><span className="text-sm font-bold text-slate-800">{title}</span></span>
  );
  const line = (label: string, value: React.ReactNode, key?: string) => (
    <span key={key} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-xs">
      <span className="text-slate-600 min-w-0 truncate">{label}</span><span className="shrink-0">{value}</span>
    </span>
  );
  const nothing = (what: string) => <p className="text-xs text-slate-400">{view.canEdit ? `Add ${what} with Edit essentials.` : 'Not added yet.'}</p>;

  return (
    <Panel icon={Building2} title="Office essentials" blurb="The things everyone asks on their first day, and again a month later."
      aside={view.canEdit && <button type="button" className={btnSec} onClick={() => setEditing(true)}><Pencil className="w-4 h-4" />Edit essentials</button>}>
      <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
      <motion.div variants={listV} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-1">
        <motion.div variants={rowV} className={tile}>
          {head(Wifi, 'Studio Wi-Fi')}
          {e?.wifiName ? (
            <>
              <span className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Network</span><span className="text-sm font-bold text-slate-800">{e.wifiName}</span></span>
              <span className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Password</span>
                <span className="flex items-center gap-1.5">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={String(reveal)} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: -90, opacity: 0 }} transition={{ duration: 0.25 }}
                      className={`text-sm font-bold text-slate-800 ${reveal ? 'font-mono' : 'tracking-widest'}`}>
                      {e.wifiPassword ? (reveal ? e.wifiPassword : '••••••••') : 'Open network'}
                    </motion.span>
                  </AnimatePresence>
                  {e.wifiPassword && <button type="button" onClick={() => setReveal(!reveal)} aria-label={reveal ? 'Hide the password' : 'Show the password'} className="w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:bg-[#3D52A0]/10 hover:text-[#3D52A0]">{reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                  {e.wifiPassword && <CopyButton text={e.wifiPassword} label="the Wi-Fi password" />}
                </span>
              </span>
            </>
          ) : nothing('the Wi-Fi')}
        </motion.div>

        <motion.div variants={rowV} className={tile}>
          {head(MapPin, 'Studio address')}
          {e?.address ? (
            <>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{e.address}</p>
              {(e.landmark || e.addressNote) && <p className="text-[11px] text-slate-500">{[e.landmark && `Landmark: ${e.landmark}.`, e.addressNote].filter(Boolean).join(' ')}</p>}
              <span className="mt-auto flex flex-wrap items-center gap-2">
                <CopyButton text={[e.address, e.landmark && `Landmark: ${e.landmark}`].filter(Boolean).join('\n')} label="the address for a cab" />
                <span className="text-[11px] text-slate-500">Copy for a cab</span>
                {e.mapsUrl && <a href={e.mapsUrl} target="_blank" rel="noopener noreferrer" className={`${btnSm} ml-auto`}>Open in Maps</a>}
              </span>
            </>
          ) : nothing('the address')}
        </motion.div>

        <motion.div variants={rowV} className={tile}>
          {head(Clock, 'Studio hours')}
          <p className="text-2xl font-black text-slate-800 tabular-nums">{hm(policy.start)} <span className="text-xs font-semibold text-slate-500">to</span> {hm(policy.end)}</p>
          <p className="text-[11px] text-slate-500">Late after {hm(policy.lateAfter)}. Off on {offDays(policy) || 'no fixed days'}. From the People policy, so it never goes stale.</p>
          {next && <span className={`${chip} mt-auto self-start bg-[#3D52A0]/10 text-[#3D52A0]`}>Next holiday · {policy.holidayNames?.[next] || niceDay(next)}{daysBetween(view.today, next) > 0 ? `, in ${daysBetween(view.today, next)} days` : ', today'}</span>}
        </motion.div>

        <motion.div variants={rowV} className={tile}>
          {head(Printer, 'Printers and plotter')}
          {e?.printers.length ? <div className="flex flex-col">{e.printers.map((p, i) => line(p.label || 'Printer', <span className="font-mono text-[11px] font-bold text-slate-800">{p.name}</span>, `${i}`))}</div> : nothing('the printers')}
        </motion.div>

        <motion.div variants={rowV} className={tile}>
          {head(Wrench, 'Office help')}
          {e?.help.length ? <div className="flex flex-col">{e.help.map((h, i) => line(h.label, <a href={telHref(h.phone)} className="text-xs font-bold text-[#3D52A0] hover:text-[#334486] tabular-nums">{h.phone}</a>, `${i}`))}</div> : nothing('who to call for repairs')}
        </motion.div>

        <motion.div variants={rowV} className="group relative rounded-2xl border border-rose-200 bg-gradient-to-br from-white to-rose-50 p-4 flex flex-col gap-2.5 pp-lift">
          {head(Siren, 'In an emergency', 'bad')}
          {e?.emergency.length || e?.firstAid ? (
            <div className="flex flex-col">
              {e.emergency.map((h, i) => line(h.label, /\d{3}/.test(h.phone) && /^[0-9+()\- ]+$/.test(h.phone)
                ? <a href={telHref(h.phone)} className="text-xs font-black text-rose-700 tabular-nums">{h.phone}</a>
                : <span className="text-xs font-bold text-slate-700">{h.phone}</span>, `${i}`))}
              {e.firstAid && line('First-aid kit', <span className="text-xs font-bold text-slate-700">{e.firstAid}</span>, 'fa')}
            </div>
          ) : nothing('emergency numbers')}
        </motion.div>
      </motion.div>
      {e?.updatedAt && <p className="text-[11px] text-slate-500 mt-4">Last changed on {niceDay(e.updatedAt)}{view.entries.find((x) => x.id === e.updatedBy) ? ` by ${view.entries.find((x) => x.id === e.updatedBy)!.name}` : ''}.</p>}
      {editing && <EditEssentialsSheet e={e || NO_ESSENTIALS} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setNotice('The essentials are saved. Everyone sees them now.'); }} />}
    </Panel>
  );
}

/* ── Admins: edit the essentials ─────────────────────────────────────────── */

type Pair = { a: string; b: string };
function Pairs({ id, label, a, b, rows, max, onChange }: { id: string; label: string; a: string; b: string; rows: Pair[]; max: number; onChange: (r: Pair[]) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input aria-label={`${a} ${i + 1}`} id={i === 0 ? id : undefined} className={input} placeholder={a} value={r.a} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
              <input aria-label={`${b} ${i + 1}`} className={input} placeholder={b} value={r.b} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
              <button type="button" aria-label={`Remove ${a.toLowerCase()} ${i + 1}`} className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => onChange(rows.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length < max && <button type="button" className={`${btnSm} self-start`} onClick={() => onChange([...rows, { a: '', b: '' }])}><Plus className="w-3.5 h-3.5" />Add a line</button>}
      </div>
    </div>
  );
}

function EditEssentialsSheet({ e, onClose, onSaved }: { e: Essentials; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...e });
  const [printers, setPrinters] = useState<Pair[]>(e.printers.map((p) => ({ a: p.label, b: p.name })));
  const [help, setHelp] = useState<Pair[]>(e.help.map((h) => ({ a: h.label, b: h.phone })));
  const [sos, setSos] = useState<Pair[]>(e.emergency.map((h) => ({ a: h.label, b: h.phone })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const put = (k: keyof Essentials) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  const filled = (rows: Pair[]) => rows.filter((r) => r.a.trim() || r.b.trim());
  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await runGuide('essentials', {
      wifiName: f.wifiName, wifiPassword: f.wifiPassword, address: f.address, landmark: f.landmark, mapsUrl: f.mapsUrl.trim(), addressNote: f.addressNote, firstAid: f.firstAid,
      printers: filled(printers).map((p) => ({ label: p.a, name: p.b })),
      help: filled(help).map((h) => ({ label: h.a, phone: h.b })),
      emergency: filled(sos).map((h) => ({ label: h.a, phone: h.b })),
    });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    onSaved();
  };
  return (
    <Sheet eyebrow="Office essentials" title="Edit the essentials" sub="Everyone in the studio sees these, the Wi-Fi password included. The hours come from Studio settings → People." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={saving} onClick={save}><Check className="w-4 h-4" />{saving ? 'Saving…' : 'Save the essentials'}</button>
      </>}>
      {error && <Notice text={error} tone="bad" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label htmlFor="es-wifi">Wi-Fi name</Label><input id="es-wifi" className={input} value={f.wifiName} onChange={put('wifiName')} maxLength={60} /></div>
        <div><Label htmlFor="es-pass">Wi-Fi password</Label><input id="es-pass" className={input} value={f.wifiPassword} onChange={put('wifiPassword')} maxLength={80} autoComplete="off" /></div>
        <div className="sm:col-span-2"><Label htmlFor="es-addr">Studio address</Label><textarea id="es-addr" className={input} rows={3} value={f.address} onChange={put('address')} maxLength={300} /></div>
        <div><Label htmlFor="es-land">Landmark</Label><input id="es-land" className={input} value={f.landmark} onChange={put('landmark')} maxLength={120} /></div>
        <div><Label htmlFor="es-map">Map link</Label><input id="es-map" className={input} value={f.mapsUrl} onChange={put('mapsUrl')} placeholder="https://maps.app.goo.gl/…" maxLength={500} /></div>
        <div className="sm:col-span-2"><Label htmlFor="es-note">Note for visitors</Label><input id="es-note" className={input} value={f.addressNote} onChange={put('addressNote')} placeholder="Visitor parking in the basement" maxLength={200} /></div>
      </div>
      <Pairs id="es-printers" label="Printers" a="What it prints" b="Its name on the network" rows={printers} max={6} onChange={setPrinters} />
      <Pairs id="es-help" label="Office help" a="Who (electrician, AC service…)" b="Their number" rows={help} max={10} onChange={setHelp} />
      <Pairs id="es-sos" label="In an emergency" a="Who (ambulance, building security…)" b="Number or directions" rows={sos} max={8} onChange={setSos} />
      <div><Label htmlFor="es-aid">Where the first-aid kit is</Label><input id="es-aid" className={input} value={f.firstAid} onChange={put('firstAid')} placeholder="Pantry, top shelf" maxLength={120} /></div>
    </Sheet>
  );
}
