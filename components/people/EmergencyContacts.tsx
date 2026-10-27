import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HeartPulse, Lock, LockOpen, Pencil, Phone, Check, RefreshCw, ShieldCheck, Plus, X } from '@/lib/lucide-shim';
import { BLOOD_GROUPS, EMERGENCY_RECHECK_DAYS, emergencyDue, type Emergency, type EmergencyContact, type GuideView } from '../../lib/peopleGuide';
import { runGuide } from '../../services/peopleGuideService';
import { Sheet, Label, input, btnPri, btnSec, btnSm } from '../opsDesk/OpsDeskPanels';
import { Panel, Empty, Notice, Skeleton, IconTile, listV, rowV, EASE } from './PeopleBits';
import { Face, chip, niceDay, telHref } from './GuideBits';

/*
  EMERGENCY CONTACTS (lib/peopleGuide.ts; approved mockup I, 27 Oct 2026).

  Who to call if something happens to someone at work. Private, and never in
  the office guide: each person keeps their own; admins see only who has
  added theirs. An admin opens someone's with a reason, the opening is
  recorded on that person's contacts, and the person is told
  (lib/notify emergencyOpenedDraft). Everyone is asked to check theirs twice
  a year.
*/

const due = (checkedAt: string) => {
  const d = new Date(checkedAt);
  d.setDate(d.getDate() + EMERGENCY_RECHECK_DAYS);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export function EmergencySection({ view, meId, error, onRefresh }: { view: GuideView | null; meId: string; error: string | null; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);
  if (!view) {
    return (
      <Panel icon={HeartPulse} title="Emergency contacts" blurb="Who to call if something happens to you at work.">
        {error ? <Empty icon={HeartPulse} text={error}><button type="button" className={btnSec} onClick={onRefresh}><RefreshCw className="w-4 h-4" />Try again</button></Empty>
          : <Skeleton className="h-56 rounded-2xl" />}
      </Panel>
    );
  }
  const mine = view.emergency;
  const stale = emergencyDue(mine, view.today);
  const names = new Map(view.entries.map((e) => [e.id, e.name]));
  const stillRight = async () => {
    setBusy(true);
    setProblem(null);
    const r = await runGuide('emergencyChecked', {});
    setBusy(false);
    if ('error' in r) setProblem(r.error); else setNotice('Thank you. We will ask again in six months.');
  };

  return (
    <Panel icon={HeartPulse} title="Emergency contacts" blurb="Who to call if something happens to you at work. Private: never in the office guide."
      aside={<span className={`${chip} inline-flex items-center gap-1.5 bg-[#3D52A0]/10 text-[#3D52A0]`}><Lock className="w-3 h-3" />Only you and admins</span>}>
      <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
      {problem && <Notice text={problem} tone="bad" />}
      <div className={`grid grid-cols-1 ${view.canEdit ? 'xl:grid-cols-[1fr_380px]' : ''} gap-5 mt-1`}>
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Yours</p>
          {mine && stale && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <span className="text-sm font-semibold text-amber-900 flex-1">It has been six months. Are these still right?</span>
              <button type="button" className={btnSm} disabled={busy} onClick={stillRight}><Check className="w-3.5 h-3.5" />Still right</button>
              <button type="button" className={btnSm} onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" />Change them</button>
            </motion.div>
          )}
          {mine ? (
            <>
              <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
                {mine.contacts.map((c, i) => (
                  <motion.li key={i} variants={rowV} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 pp-lift">
                    <span className={`w-10 h-10 rounded-xl grid place-items-center text-xs font-black ${i === 0 ? 'bg-[#3D52A0] text-white' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>{i + 1}</span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{c.name}</span>
                      <span className="text-[11px] text-slate-500">{c.relation} · <a href={telHref(c.phone)} className="text-[#3D52A0] font-semibold">{c.phone}</a></span>
                    </span>
                    {i === 0 && <span className={`${chip} bg-[#3D52A0]/10 text-[#3D52A0]`}>Call first</span>}
                  </motion.li>
                ))}
              </motion.ul>
              {(mine.bloodGroup || mine.allergies) && (
                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <span className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Blood group</span><span className="text-sm font-bold text-slate-800">{mine.bloodGroup || '—'}</span></span>
                  <span className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Allergies</span><span className="text-sm font-bold text-slate-800">{mine.allergies || '—'}</span></span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-2.5">
                <span className="flex-1 text-[11px] text-slate-500">{mine.checkedAt ? `You checked these on ${niceDay(mine.checkedAt)}. We'll ask again in ${due(mine.checkedAt)}.` : 'Saved.'}</span>
                <button type="button" className={btnSm} onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" />Edit</button>
              </div>
              {mine.openings.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Opened by an admin</span>
                  {[...mine.openings].reverse().map((o) => (
                    <span key={o.id} className="text-xs text-slate-700"><b>{o.byName}</b> · {niceDay(o.at)} · “{o.reason}”</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Empty icon={HeartPulse} text="You have not added anyone yet. If something happens to you at work, the studio would not know who to call.">
              <button type="button" className={btnPri} onClick={() => setEditing(true)}><Plus className="w-4 h-4" />Add your emergency contacts</button>
            </Empty>
          )}
        </div>

        {view.canEdit && view.emergencyRoll && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">The team · sealed until needed</p>
            <motion.ul variants={listV} initial="hidden" animate="show" className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {view.emergencyRoll.map((r) => (
                <motion.li key={r.personId} variants={rowV} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <Face name={names.get(r.personId) || '?'} size="sm" />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-slate-800 truncate">{names.get(r.personId)}</span>
                    <span className="text-[11px] text-slate-500">{r.checkedAt ? `Checked ${niceDay(r.checkedAt)}` : 'Nobody to call yet'}</span>
                  </span>
                  {r.checkedAt
                    ? <button type="button" className={btnSm} onClick={() => setOpening(r.personId)}><Lock className="w-3.5 h-3.5" />Open</button>
                    : <span className={`${chip} bg-amber-100 text-amber-700`}>Not added</span>}
                </motion.li>
              ))}
            </motion.ul>
            <p className="text-[11px] text-slate-500 flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />Opening someone's contacts asks why, records it on their contacts, and tells them.</p>
          </div>
        )}
      </div>
      {editing && <EditEmergencySheet e={mine} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setNotice('Saved. Only you and the studio\'s admins can see them.'); }} />}
      {opening && <OpenSheet personId={opening} name={names.get(opening) || ''} onClose={() => setOpening(null)} />}
    </Panel>
  );
}

/* ── Your own contacts ───────────────────────────────────────────────────── */

const blank: EmergencyContact = { name: '', relation: '', phone: '' };
function EditEmergencySheet({ e, onClose, onSaved }: { e: Emergency | null; onClose: () => void; onSaved: () => void }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>(e?.contacts.length ? e.contacts.map((c) => ({ ...c })) : [{ ...blank }]);
  const [bloodGroup, setBloodGroup] = useState(e?.bloodGroup || '');
  const [allergies, setAllergies] = useState(e?.allergies || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const put = (i: number, k: keyof EmergencyContact) => (ev: React.ChangeEvent<HTMLInputElement>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, [k]: ev.target.value } : c)));
  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await runGuide('emergency', { contacts, bloodGroup, allergies });
    setSaving(false);
    if ('error' in r) { setError(r.error); return; }
    onSaved();
  };
  return (
    <Sheet eyebrow="Emergency contacts" title="Who should we call?" sub="Only you and the studio's admins see these. An admin who opens them has to say why, and you are told." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={saving} onClick={save}><Check className="w-4 h-4" />{saving ? 'Saving…' : 'Save my contacts'}</button>
      </>}>
      {error && <Notice text={error} tone="bad" />}
      <AnimatePresence initial={false}>
        {contacts.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{i === 0 ? 'Call first' : 'If they do not answer'}</span>
              {i > 0 && <button type="button" aria-label="Remove the second contact" className="w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setContacts(contacts.slice(0, 1))}><X className="w-4 h-4" /></button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label htmlFor={`em-n${i}`}>Name</Label><input id={`em-n${i}`} className={input} value={c.name} onChange={put(i, 'name')} maxLength={80} /></div>
              <div><Label htmlFor={`em-r${i}`}>Relation to you</Label><input id={`em-r${i}`} className={input} value={c.relation} onChange={put(i, 'relation')} placeholder="Father, sister, friend…" maxLength={40} /></div>
              <div><Label htmlFor={`em-p${i}`}>Phone</Label><input id={`em-p${i}`} className={input} value={c.phone} onChange={put(i, 'phone')} inputMode="tel" maxLength={24} /></div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {contacts.length < 2 && <button type="button" className={`${btnSm} self-start`} onClick={() => setContacts([...contacts, { ...blank }])}><Plus className="w-3.5 h-3.5" />Add a second person</button>}
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
        <div>
          <Label htmlFor="em-bg">Blood group</Label>
          <select id="em-bg" className={input} value={bloodGroup} onChange={(ev) => setBloodGroup(ev.target.value)}>
            <option value="">Rather not say</option>{BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div><Label htmlFor="em-al">Allergies</Label><input id="em-al" className={input} value={allergies} onChange={(ev) => setAllergies(ev.target.value)} placeholder="Optional" maxLength={200} /></div>
      </div>
      <p className="text-[11px] text-slate-500">Both are optional. Leave them blank if you would rather not say.</p>
    </Sheet>
  );
}

/* ── Admins: open someone's, with a reason ───────────────────────────────── */

function OpenSheet({ personId, name, onClose }: { personId: string; name: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Pick<Emergency, 'contacts' | 'bloodGroup' | 'allergies'> | null>(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    const r = await runGuide('openEmergency', { personId, reason });
    setBusy(false);
    if ('error' in r) { setError(r.error); return; }
    setOpened(r.result?.opened || null);
  };
  return (
    <Sheet eyebrow="Emergency contacts" title={opened ? `${name}'s emergency contacts` : `Open ${name}'s emergency contacts?`}
      sub={opened ? `${name} has been told you opened them, and why.` : `This is recorded on ${name}'s contacts, with your reason, and ${name} is told.`} onClose={onClose}
      footer={opened ? <button type="button" className={btnPri} onClick={onClose}>Done</button> : <>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPri} disabled={busy || reason.trim().length < 5} onClick={open}><LockOpen className="w-4 h-4" />{busy ? 'Opening…' : 'Open and record it'}</button>
      </>}>
      {error && <Notice text={error} tone="bad" />}
      {!opened ? (
        <div>
          <Label htmlFor="em-why">Why do you need them?</Label>
          <input id="em-why" className={input} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Fell from a ladder at the site, going to hospital" autoFocus />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <motion.div initial={{ rotate: 0 }} animate={{ rotate: [0, -12, 8, 0] }} transition={{ duration: 0.8, ease: EASE }} className="self-center">
            <IconTile icon={LockOpen} tone="bad" size="lg" />
          </motion.div>
          <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
            {opened.contacts.map((c, i) => (
              <motion.li key={i} variants={rowV} className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-sm font-bold text-slate-800">{c.name}</span>
                  <span className="text-[11px] text-slate-600">{c.relation}{i === 0 ? ' · call first' : ''}</span>
                </span>
                <a href={telHref(c.phone)} className={btnSm}><Phone className="w-3.5 h-3.5" />{c.phone}</a>
              </motion.li>
            ))}
          </motion.ul>
          {(opened.bloodGroup || opened.allergies) && (
            <p className="text-xs text-slate-700"><b>Blood group:</b> {opened.bloodGroup || '—'} · <b>Allergies:</b> {opened.allergies || '—'}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
