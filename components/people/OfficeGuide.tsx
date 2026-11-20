import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import '../projectHeader/projectHeader.css';
import {
  BookUser, Search, Monitor, Cake, Phone, Mail, Pencil, ShieldCheck, Download, X, Star, Hash, KeyRound, Armchair, Check, RefreshCw,
} from '@/lib/lucide-shim';
import { clock12, type Snapshot } from '../../lib/peopleDesk';
import { awayOn, todayOf } from '../../lib/peopleView';
import type { GuideEntry, GuideView, Occasion } from '../../lib/peopleGuide';
import { runGuide } from '../../services/peopleGuideService';
import { Sheet, Label, input, btnPri, btnSec } from '../opsDesk/OpsDeskPanels';
import { Glide, Notice, Panel, Empty, Ring, Skeleton, IconTile, listV, rowV, EASE } from './PeopleBits';
import { CopyButton, Face, TEAM_LABEL, MONTH_NAMES, chip, monthDay, longDate, fromNow, telHref, firstName, niceDay } from './GuideBits';

/*
  THE OFFICE GUIDE (lib/peopleGuide.ts; approved mockup 1, 27 Oct 2026).

  Everyone's desk, computer, office mobile, office email, extension and
  birthday, in one table or as cards that turn over. It replaced the
  Directory, so it also says who is in today. A name opens their contact
  card; admins edit the details. Personal numbers and birth years are never
  kept here.
*/

type Today = { label: string; tint: string; dot: string; here: boolean; live: boolean } | null;

/** What the People snapshot says about each person today: in, away or at home. Only what this person may see. */
function useTodayStatus(s: Snapshot) {
  return useMemo(() => {
    const today = todayOf(s);
    const out = new Map<string, Today>();
    for (const a of awayOn(s, today)) {
      out.set(a.personId, a.mode === 'WFH'
        ? { label: 'From home', tint: 'bg-[#3D52A0]/10 text-[#3D52A0]', dot: 'bg-[#3D52A0]', here: false, live: false }
        : { label: a.portion === 'Full day' ? 'Away today' : `Away · ${a.portion.toLowerCase()}`, tint: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', here: false, live: false });
    }
    for (const a of s.attendance.filter((x) => x.date === today)) {
      const where = a.mode === 'Site' ? 'On site' : a.mode === 'WFH' ? 'From home' : 'In';
      out.set(a.employeeId, a.checkOut
        ? { label: `${where} · left ${clock12(a.checkOut, s.policy.timezone)}`, tint: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', here: false, live: false }
        : { label: `${where} since ${clock12(a.checkIn, s.policy.timezone)}`, tint: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', here: a.mode !== 'WFH', live: true });
    }
    return out;
  }, [s]);
}

const head = 'text-left px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap';

export function OfficeGuideSection({ s, view, loading, error, onRefresh }: { s: Snapshot; view: GuideView | null; loading: boolean; error: string | null; onRefresh: () => void }) {
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('all');
  const [sort, setSort] = useState<'name' | 'birthday'>('name');
  /* On a phone the cards read better than a table that scrolls sideways. */
  const [mode, setMode] = useState<'table' | 'cards'>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'cards' : 'table'));
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GuideEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);
  const status = useTodayStatus(s);

  if (!view) {
    return (
      <Panel icon={BookUser} title="Office guide" blurb="Everyone's desk, computer, office number, email and birthday in one place.">
        {error ? <Empty icon={BookUser} text={error}><button type="button" className={btnSec} onClick={onRefresh}><RefreshCw className="w-4 h-4" />Try again</button></Empty>
          : <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>}
      </Panel>
    );
  }

  const nextBirthday = new Map<string, Occasion>();
  for (const o of view.upcoming) if (o.kind === 'birthday' && !nextBirthday.has(o.personId)) nextBirthday.set(o.personId, o);
  const teams = [...new Set(view.entries.map((e) => e.teamId))];
  const needle = q.trim().toLowerCase();
  const rows = view.entries
    .filter((e) => team === 'all' || e.teamId === team)
    .filter((e) => !needle || `${e.name} ${e.title} ${TEAM_LABEL[e.teamId] || ''} ${e.desk} ${e.computer} ${e.ext} ${e.email} ${e.mobile}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const da = nextBirthday.get(a.id)?.days ?? (a.birthday ? 1000 + daysToMonthDay(view.today, a.birthday) : 9999);
      const dbb = nextBirthday.get(b.id)?.days ?? (b.birthday ? 1000 + daysToMonthDay(view.today, b.birthday) : 9999);
      return da - dbb || a.name.localeCompare(b.name);
    });
  const open = view.entries.find((e) => e.id === openId) || null;
  const birthdays = view.upcoming.filter((o) => o.kind === 'birthday');
  const names = new Map(view.entries.map((e) => [e.id, e.name]));

  return (
    <>
      <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
      <Panel icon={BookUser} title="Office guide"
        blurb="Everyone's desk, computer, office number, email and birthday in one place. Tap a number to call, an address to write, or copy either."
        aside={<label className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" /><input aria-label="Search the office guide" className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] w-56" placeholder="Name, desk, computer or ext." value={q} onChange={(e) => setQ(e.target.value)} /></label>}>

        {birthdays.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 mb-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Birthdays in the next 30 days</p>
            <motion.div variants={listV} initial="hidden" animate="show" className="flex gap-3 overflow-x-auto pb-1">
              {birthdays.map((o) => (
                <motion.div key={o.id} variants={rowV} className="shrink-0 flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full border border-slate-200 bg-white pp-lift">
                  <Ring value={1 - o.days / 30} size={44} stroke={3} tone={o.days === 0 ? 'ok' : 'brand'} label={`${names.get(o.personId)}: ${fromNow(o.days)}`}>
                    <span className="text-[11px] font-black text-[#3D52A0]">{(names.get(o.personId) || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>
                  </Ring>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">{firstName(names.get(o.personId) || '')}</span>
                    <span className="text-[11px] text-slate-500">{o.days === 0 ? 'Today' : `${niceDay(o.date)} · ${fromNow(o.days).toLowerCase()}`}</span>
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1 pb-3 border-b border-slate-200/50">
          <Glide id="guide-team" label="Team" value={team} onChange={setTeam}
            options={[{ id: 'all', label: `All ${view.entries.length}` }, ...teams.map((t) => ({ id: t, label: `${TEAM_LABEL[t] || 'Studio'} ${view.entries.filter((e) => e.teamId === t).length}` }))]} />
          <div className="ml-auto flex flex-wrap gap-2">
            <Glide id="guide-sort" label="Sort" value={sort} onChange={setSort} options={[{ id: 'name', label: 'A to Z' }, { id: 'birthday', label: 'Next birthday' }]} />
            <Glide id="guide-view" label="View" value={mode} onChange={setMode} options={[{ id: 'table', label: 'Table' }, { id: 'cards', label: 'Cards' }]} />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-4"><Empty icon={Search} text="Nobody matches that. Try a name, a desk like D-04, or an extension." /></div>
        ) : mode === 'table' ? (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead><tr>
                <th scope="col" className={head}>Person</th>
                <th scope="col" className={head}>Desk and computer</th>
                <th scope="col" className={head}>Office mobile</th>
                <th scope="col" className={head}>Office email</th>
                <th scope="col" className={head}>Ext.</th>
                <th scope="col" className={head}>Birthday</th>
                <th scope="col" className={head}>Today</th>
                {view.canEdit && <th scope="col" className={head}><span className="sr-only">Edit</span></th>}
              </tr></thead>
              <motion.tbody key={`${team}|${sort}|${needle}`} variants={listV} initial="hidden" animate="show">
                {rows.map((e) => {
                  const t = status.get(e.id) || null;
                  const nb = nextBirthday.get(e.id);
                  return (
                    <motion.tr key={e.id} variants={rowV} className="group/row border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-2.5">
                        <button type="button" onClick={() => setOpenId(e.id)} className="flex items-center gap-3 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30">
                          <Face name={e.name} here={!!t?.here} live={!!t?.live} />
                          <span className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{e.name}{e.id === s.me.id ? ' (you)' : ''}</span>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap">{e.title || TEAM_LABEL[e.teamId] || 'Studio'}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {e.desk ? <span className={`${chip} bg-[#3D52A0]/10 text-[#3D52A0]`}>{e.desk}</span> : <span className="text-xs text-slate-400">—</span>}
                          {e.computer && <span className="inline-flex items-center gap-1 text-slate-500"><Monitor className="w-3.5 h-3.5" /><span className="font-mono text-[11px] text-slate-700">{e.computer}</span></span>}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {e.mobile ? (
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <a href={telHref(e.mobile)} className="text-xs font-semibold text-[#3D52A0] hover:text-[#334486] tabular-nums">{e.mobile}</a>
                            <CopyButton text={e.mobile} label={`${firstName(e.name)}'s number`} quiet />
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {e.email ? (
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <a href={`mailto:${e.email}`} className="text-xs font-semibold text-[#3D52A0] hover:text-[#334486]">{e.email}</a>
                            <CopyButton text={e.email} label={`${firstName(e.name)}'s email`} quiet />
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-xs font-black text-slate-800 tabular-nums">{e.ext || <span className="font-normal text-slate-400">—</span>}</td>
                      <td className="px-2 py-2.5">
                        {e.birthday ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Cake className={`w-3.5 h-3.5 ${nb?.days === 0 ? 'text-emerald-500' : nb && nb.days <= 14 ? 'text-[#3D52A0]' : 'text-slate-400'}`} />
                            <span className="text-xs font-semibold text-slate-700">{monthDay(e.birthday)}</span>
                            {nb && nb.days <= 14 && <span className={`${chip} ${nb.days === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>{fromNow(nb.days)}</span>}
                            {!e.showBirthday && <span className={`${chip} bg-slate-100 text-slate-600`} title="Only admins and the person see it">Private</span>}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {t ? <span className={`${chip} inline-flex items-center gap-1.5 ${t.tint}`}><span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />{t.label}</span> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      {view.canEdit && (
                        <td className="px-2 py-2.5 text-right">
                          <button type="button" onClick={() => setEditing(e)} aria-label={`Edit ${e.name}'s office details`} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-[#3D52A0]/10 hover:text-[#3D52A0] transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        ) : (
          <motion.div key={`${team}|${sort}|${needle}`} variants={listV} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
            {rows.map((e) => <FlipCard key={e.id} e={e} today={status.get(e.id) || null} you={e.id === s.me.id} onOpen={() => setOpenId(e.id)} />)}
          </motion.div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Office numbers only. Personal numbers and birth years are never kept here.</p>
          <p className="text-[11px] text-slate-500">Showing <b className="text-slate-800">{rows.length}</b> of {view.entries.length}{view.canEdit ? ' · you can edit any row' : ' · kept up to date by admins'}{loading ? ' · refreshing…' : ''}</p>
        </div>
      </Panel>

      <AnimatePresence>
        {open && <ContactCard key={open.id} e={open} view={view} today={status.get(open.id) || null} you={open.id === s.me.id} onClose={() => setOpenId(null)} onEdit={view.canEdit ? () => { setEditing(open); setOpenId(null); } : undefined} />}
      </AnimatePresence>
      {editing && <EditOfficeSheet e={editing} today={view.today} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); setNotice(m); }} />}
    </>
  );
}

/* Days until an "MM-DD" comes round, for sorting birthdays further away than the 30-day list. */
function daysToMonthDay(today: string, md: string): number {
  const y = Number(today.slice(0, 4));
  const at = (yy: number) => Date.UTC(yy, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5)));
  const now = Date.UTC(y, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const next = at(y) >= now ? at(y) : at(y + 1);
  return Math.round((next - now) / 86400000);
}

/* ── A card that turns over to show how to reach them ────────────────────── */

const FlipCard: React.FC<{ e: GuideEntry; today: Today; you: boolean; onOpen: () => void }> = ({ e, today, you, onOpen }) => {
  const [over, setOver] = useState(false);
  return (
    <motion.div variants={rowV} className="pp-3d h-44">
      <motion.button type="button" onClick={onOpen} aria-label={`${e.name}: open contact card`}
        onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)} onFocus={() => setOver(true)} onBlur={() => setOver(false)}
        className="pp-keep relative block w-full h-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30"
        animate={{ rotateY: over ? 180 : 0 }} transition={{ duration: 0.7, ease: EASE }}>
        <span className="pp-face absolute inset-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 flex flex-col gap-2.5">
          <span className="flex items-center gap-3">
            <Face name={e.name} here={!!today?.here} live={!!today?.live} size="lg" />
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-800 truncate">{e.name}{you ? ' (you)' : ''}</span>
              <span className="text-[11px] text-slate-500 truncate">{e.title || TEAM_LABEL[e.teamId] || 'Studio'}</span>
            </span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {e.desk && <span className={`${chip} bg-[#3D52A0]/10 text-[#3D52A0]`}>{e.desk}</span>}
            {today && <span className={`${chip} inline-flex items-center gap-1.5 ${today.tint}`}><span className={`w-1.5 h-1.5 rounded-full ${today.dot}`} />{today.label}</span>}
          </span>
          <span className="mt-auto flex items-center justify-between text-[11px] text-slate-500">
            <span>{e.birthday ? `Birthday ${monthDay(e.birthday)}` : ''}</span>
            <span className="font-bold text-[#3D52A0]">Turn over</span>
          </span>
        </span>
        <span className="pp-face pp-flipped absolute inset-0 rounded-2xl bg-[#3D52A0] text-white p-4 flex flex-col gap-1.5 shadow-[0_18px_34px_-22px_rgba(61,82,160,0.6)]">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">{firstName(e.name)}{e.ext ? ` · ext. ${e.ext}` : ''}</span>
          <span className="text-sm font-bold tabular-nums">{e.mobile || 'No office mobile'}</span>
          <span className="text-xs font-semibold truncate">{e.email}</span>
          {e.computer && <span className="font-mono text-[11px] text-white/85">{e.computer}</span>}
          <span className="mt-auto text-[11px] font-bold text-white/90">Open contact card</span>
        </span>
      </motion.button>
    </motion.div>
  );
};

/* ── The contact card, sliding in from the right ─────────────────────────── */

const vcf = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
function saveContact(e: GuideEntry) {
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0', `FN:${vcf(e.name)}`,
    e.title ? `TITLE:${vcf(e.title)}` : '',
    e.mobile ? `TEL;TYPE=WORK,CELL:${vcf(e.mobile)}` : '',
    e.email ? `EMAIL;TYPE=WORK:${vcf(e.email)}` : '',
    [e.desk && `Desk ${e.desk}`, e.ext && `ext. ${e.ext}`].filter(Boolean).length ? `NOTE:${vcf([e.desk && `Desk ${e.desk}`, e.ext && `ext. ${e.ext}`].filter(Boolean).join(', '))}` : '',
    'END:VCARD',
  ].filter(Boolean);
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/vcard' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${e.name.replace(/[^\w ]+/g, '').trim() || 'contact'}.vcf`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ContactCard: React.FC<{ e: GuideEntry; view: GuideView; today: Today; you: boolean; onClose: () => void; onEdit?: () => void }> = ({ e, view, today, you, onClose, onEdit }) => {
  useEffect(() => {
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const birthday = view.upcoming.find((o) => o.personId === e.id && o.kind === 'birthday' && o.days === 0);
  const rows: { icon: React.ComponentType<any>; label: string; value: string; sub?: string; copy?: boolean; mono?: boolean; href?: string }[] = [
    { icon: Armchair, label: 'Desk', value: e.desk },
    { icon: Monitor, label: 'Computer', value: e.computer, copy: true, mono: true },
    ...(view.canEdit ? [{ icon: KeyRound, label: 'Remote desktop ID', value: e.remoteId || '', sub: 'Admins only, for IT help from a distance', copy: true }] : []),
    { icon: Phone, label: 'Office mobile', value: e.mobile, copy: true, href: e.mobile ? telHref(e.mobile) : undefined },
    { icon: Mail, label: 'Office email', value: e.email, copy: true, href: e.email ? `mailto:${e.email}` : undefined },
    { icon: Hash, label: 'Extension', value: e.ext, copy: true },
    { icon: Cake, label: 'Birthday', value: e.birthday ? `${Number(e.birthday.slice(3))} ${MONTH_NAMES[Number(e.birthday.slice(0, 2)) - 1]}` : '', sub: e.birthday ? (e.showBirthday ? 'Day and month only' : 'Private: only admins and the person see it') : undefined },
    { icon: Star, label: 'With the studio since', value: e.joinedOn ? longDate(e.joinedOn) : '' },
  ];
  return (
    <div className="fixed inset-0 z-[300] flex justify-end" role="dialog" aria-modal="true" aria-label={`${e.name}'s contact card`}>
      <motion.div className="absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="relative w-full max-w-[460px] h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col"
        style={{ transformPerspective: 1200, transformOrigin: 'right center' }}
        initial={{ x: 60, rotateY: -8, opacity: 0 }} animate={{ x: 0, rotateY: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
        <div className="px-6 pt-5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Office guide</span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6 flex flex-col gap-4">
          <section className="pp-glass relative overflow-hidden rounded-3xl p-5 flex items-center gap-4">
            <span className="pp-glow" />
            <motion.span initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} style={{ transformPerspective: 600 }} className="relative">
              <Face name={e.name} here={!!today?.here} live={!!today?.live} size="lg" />
            </motion.span>
            <div className="relative min-w-0">
              <h2 className="font-bold text-slate-800">{e.name}{you ? ' (you)' : ''}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{[e.title, TEAM_LABEL[e.teamId]].filter(Boolean).join(' · ')}</p>
              {today && <span className={`${chip} mt-2 inline-flex items-center gap-1.5 ${today.tint}`}><span className={`w-1.5 h-1.5 rounded-full ${today.dot}`} />{today.label}</span>}
            </div>
          </section>

          <motion.div variants={listV} initial="hidden" animate="show" className="grid grid-cols-3 gap-2">
            {[
              { icon: Phone, label: 'Call', href: e.mobile ? telHref(e.mobile) : '' },
              { icon: Mail, label: 'Email', href: e.email ? `mailto:${e.email}` : '' },
              { icon: Download, label: 'Save contact', onClick: () => saveContact(e) },
            ].map((a) => {
              const body = (<><IconTile icon={a.icon} /><span className="text-xs font-bold text-slate-700">{a.label}</span></>);
              const cls = 'group w-full rounded-2xl border border-slate-200 p-3 flex flex-col items-center gap-2 pp-lift disabled:opacity-50';
              return (
                <motion.div key={a.label} variants={rowV}>
                  {a.onClick ? <button type="button" className={cls} onClick={a.onClick}>{body}</button>
                    : a.href ? <a className={cls} href={a.href}>{body}</a>
                      : <button type="button" className={cls} disabled>{body}</button>}
                </motion.div>
              );
            })}
          </motion.div>

          <motion.ul variants={listV} initial="hidden" animate="show" className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {rows.map((r) => {
              const Icon = r.icon;
              return (
                <motion.li key={r.label} variants={rowV} className="group/row flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0"><Icon className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{r.label}</span>
                    {r.value ? (r.href
                      ? <a href={r.href} className={`text-sm font-semibold text-[#3D52A0] hover:text-[#334486] truncate ${r.mono ? 'font-mono' : ''}`}>{r.value}</a>
                      : <span className={`text-sm font-semibold text-slate-800 truncate ${r.mono ? 'font-mono' : ''}`}>{r.value}</span>)
                      : <span className="text-sm text-slate-400">Not added yet</span>}
                    {r.sub && <span className="text-[11px] text-slate-500">{r.sub}</span>}
                  </span>
                  {r.copy && r.value && <CopyButton text={r.value} label={r.label.toLowerCase()} />}
                </motion.li>
              );
            })}
          </motion.ul>

          {birthday && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
              <IconTile icon={Cake} tone="ok" />
              <span className="flex-1 text-sm font-semibold text-emerald-900">{you ? 'Happy birthday! Your card is under Celebrations.' : `It's ${firstName(e.name)}'s birthday today. Sign the card under Celebrations.`}</span>
            </section>
          )}
        </div>
        <footer className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
          <span className="flex-1 text-[11px] text-slate-500">{e.updatedAt ? `Updated${e.updatedByName ? ` by ${e.updatedByName}` : ''} on ${niceDay(e.updatedAt)}` : 'Not filled in yet'}</span>
          {onEdit && <button type="button" className={btnSec} onClick={onEdit}><Pencil className="w-4 h-4" />Edit details</button>}
        </footer>
      </motion.aside>
    </div>
  );
};

/* ── Admins: edit someone's office details ───────────────────────────────── */

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function EditOfficeSheet({ e, today, onClose, onSaved }: { e: GuideEntry; today: string; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({
    desk: e.desk, computer: e.computer, mobile: e.mobile, ext: e.ext, remoteId: e.remoteId || '',
    month: e.birthday.slice(0, 2), day: e.birthday.slice(3, 5), joinedOn: e.joinedOn, showBirthday: e.showBirthday,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const put = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  const days = f.month ? DAYS.slice(0, DAYS_IN[Number(f.month) - 1]) : DAYS;
  const save = async () => {
    if (!!f.month !== !!f.day) { setError('Pick both the day and the month of the birthday, or neither.'); return; }
    setSaving(true);
    setError(null);
    const r = await runGuide('office', {
      personId: e.id, desk: f.desk, computer: f.computer, mobile: f.mobile, ext: f.ext, remoteId: f.remoteId,
      birthday: f.month && f.day ? `${f.month}-${f.day}` : '', joinedOn: f.joinedOn, showBirthday: f.showBirthday,
    });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    onSaved(`${firstName(e.name)}'s office details are saved.`);
  };
  return (
    <Sheet eyebrow="Office guide" title={`${e.name}'s office details`} sub="Everyone in the studio sees these, except the remote desktop ID. Personal numbers stay out of here." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={saving} onClick={save}><Check className="w-4 h-4" />{saving ? 'Saving…' : 'Save to the guide'}</button>
      </>}>
      {error && <Notice text={error} tone="bad" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Label htmlFor="og-desk">Desk</Label><input id="og-desk" className={input} value={f.desk} onChange={put('desk')} placeholder="D-04, or Site kit" maxLength={40} /></div>
        <div><Label htmlFor="og-pc">Computer name</Label><input id="og-pc" className={`${input} font-mono`} value={f.computer} onChange={put('computer')} placeholder="FFDS-PC-04" maxLength={60} /></div>
        <div><Label htmlFor="og-mob">Office mobile</Label><input id="og-mob" className={input} value={f.mobile} onChange={put('mobile')} placeholder="+91 98450 21804" inputMode="tel" maxLength={24} /></div>
        <div><Label htmlFor="og-ext">Extension</Label><input id="og-ext" className={input} value={f.ext} onChange={put('ext')} placeholder="204" maxLength={10} /></div>
        <div>
          <Label htmlFor="og-email">Office email</Label>
          <input id="og-email" className={input} value={e.email} disabled />
          <p className="text-[11px] text-slate-500 mt-1">From the Google sign-in. Change it in Studio settings → Team.</p>
        </div>
        <div>
          <Label htmlFor="og-rid">Remote desktop ID</Label>
          <input id="og-rid" className={input} value={f.remoteId} onChange={put('remoteId')} placeholder="Optional" maxLength={40} />
          <p className="text-[11px] text-slate-500 mt-1">Optional. Shown to admins only.</p>
        </div>
        <div>
          <Label>Birthday</Label>
          <div className="grid grid-cols-[88px_1fr] gap-2">
            <select aria-label="Day" className={input} value={f.day} onChange={put('day')}><option value="">Day</option>{days.map((d) => <option key={d} value={d}>{Number(d)}</option>)}</select>
            <select aria-label="Month" className={input} value={f.month} onChange={(ev) => { const m = ev.target.value; setF({ ...f, month: m, day: m && Number(f.day) > DAYS_IN[Number(m) - 1] ? '' : f.day }); }}>
              <option value="">Month</option>{MONTH_NAMES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Day and month only. The year is never asked for.</p>
        </div>
        <div><Label htmlFor="og-join">Joined the studio</Label><input id="og-join" type="date" className={input} value={f.joinedOn} max={today} onChange={put('joinedOn')} /></div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-800">Show the birthday to the team</span>
          <span className="block text-[11px] text-slate-500">When it is off, there is no card or banner, and only admins see the date.</span>
        </span>
        <button type="button" role="switch" aria-checked={f.showBirthday} aria-label="Show the birthday to the team" onClick={() => setF({ ...f, showBirthday: !f.showBirthday })}
          className={`relative w-11 h-6 rounded-full transition-colors ${f.showBirthday ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
          <motion.span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow" animate={{ left: f.showBirthday ? 22 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }} />
        </button>
      </div>
    </Sheet>
  );
}
