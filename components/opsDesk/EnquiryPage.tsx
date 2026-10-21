import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, AtSign, MapPin, CalendarCheck, Send, MessageCircle } from '@/lib/lucide-shim';
import { Confetti, DoneTick, Glide, Skeleton, Tilt, listV, rowV } from '../people/PeopleBits';
import { SCOPES } from '../../lib/leads';
import { HOME_TYPES, enquiryProblems, type Enquiry } from '../../lib/leadForm';
import { LEAD_SOURCES, type LeadSource } from '../../lib/leads';
import { formDoor, sendEnquiry, type FormDoor } from '../../services/leadsService';

/*
  THE STUDIO'S PUBLIC ENQUIRY FORM (lib/leadForm.ts). Opened from the link a
  studio puts on its website or Instagram (`?enquire=<token>`), with no
  sign-in. One card in the app's own look: who is asking, about which home,
  and what they want done. What is sent becomes a lead on the Ops Desk
  (functions/src/leads.ts). `&embed=1` drops the page background, for an
  iframe on the studio's own site; `&src=instagram` (or referral, walkin…)
  says where the link was shared.
*/

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]';
const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';

export default function EnquiryPage({ token, embed, source }: { token: string; embed: boolean; source: string | null }) {
  const [door, setDoor] = useState<FormDoor | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [f, setF] = useState({ name: '', phone: '', email: '', where: '', type: '', scope: [] as string[], possession: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const src: LeadSource = LEAD_SOURCES.some((s) => s.id === source) ? (source as LeadSource) : 'website';
  const problems = useMemo(() => enquiryProblems(f), [f]);

  useEffect(() => {
    formDoor(token).then(setDoor).catch(() => setDoor({ open: false }));
  }, [token]);
  useEffect(() => {
    if (door?.name) document.title = `Enquiry · ${door.name}`;
  }, [door?.name]);

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const send = async () => {
    setTried(true);
    if (problems.length) return;
    setSending(true);
    setError(null);
    try {
      const enquiry: Enquiry = { ...f, source: src, openedAt };
      const r = await sendEnquiry(token, enquiry);
      if (r.ok) setSent(true);
      else setError(r.reason === 'busy' ? 'We have had a lot of enquiries in the last hour. Please try again a little later, or call us.'
        : r.reason === 'invalid' ? `Please add ${(r.problems || []).join(' and ')}.`
          : 'This form is not taking enquiries just now. Please call or email the studio.');
    } catch {
      setError('That did not go through. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const studio = door?.name || 'the studio';
  return (
    <div className={`${embed ? '' : 'min-h-screen bg-[#F6F7FB]'} w-full flex justify-center px-4 py-8`}>
      <div className="w-full max-w-xl">
        {door === null ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 flex flex-col gap-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-24 w-full" /></div>
        ) : !door.open ? (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 text-center">
            <p className="font-bold text-slate-800">This enquiry form is not open.</p>
            <p className="text-xs text-slate-500 mt-1">The link may have been changed. Please contact the studio directly.</p>
          </div>
        ) : (
          <Tilt max={3} className="rounded-3xl">
            <motion.section initial={{ opacity: 0, y: 18, rotateX: -8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformPerspective: 1200 }} className="pp-glass rounded-3xl p-6 sm:p-8 relative overflow-hidden">
              <span className="pp-glow" aria-hidden />
              <div className="relative">
                <div className="flex items-center gap-3">
                  {door.logo
                    ? <img src={door.logo} alt="" className="h-10 w-auto max-w-[140px] object-contain" />
                    : <span className="w-10 h-10 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center font-black">{studio.slice(0, 1).toUpperCase()}</span>}
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{door.name || 'Enquiry'}</p>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">Tell us about your home</h1>
                  </div>
                </div>
                {sent ? (
                  <div className="relative py-10 grid place-items-center text-center">
                    <Confetti pieces={24} spread={120} />
                    <DoneTick size={64} />
                    <p className="mt-4 font-bold text-slate-800">Thank you, {f.name.split(' ')[0] || 'we have it'}.</p>
                    <p className="text-sm text-slate-600 mt-1 max-w-sm">Someone from {studio} will call you soon.</p>
                    {door.phone && <a href={`tel:${door.phone}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#3D52A0]"><Phone className="w-4 h-4" />{door.phone}</a>}
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); send(); }} noValidate>
                    <p className="text-sm text-slate-600 mt-3">Your name and a way to reach you are enough. We will call to understand the rest.</p>
                    <motion.div variants={listV} initial="hidden" animate="show" className="mt-5 flex flex-col gap-4">
                      <motion.div variants={rowV}>
                        <label htmlFor="enq-name" className={label}>Your name</label>
                        <input id="enq-name" autoComplete="name" className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Rohan Mehta" />
                      </motion.div>
                      <motion.div variants={rowV} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="enq-phone" className={label}>Phone (WhatsApp)</label>
                          <span className="relative block"><Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input id="enq-phone" type="tel" autoComplete="tel" className={`${input} pl-9`} value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+91 98330 12345" /></span>
                        </div>
                        <div>
                          <label htmlFor="enq-email" className={label}>Email</label>
                          <span className="relative block"><AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input id="enq-email" type="email" autoComplete="email" className={`${input} pl-9`} value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" /></span>
                        </div>
                      </motion.div>
                      <motion.div variants={rowV}>
                        <label htmlFor="enq-where" className={label}>Where is the home</label>
                        <span className="relative block"><MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input id="enq-where" className={`${input} pl-9`} value={f.where} onChange={(e) => set({ where: e.target.value })} placeholder="Building and area, e.g. Hiranandani, Powai" /></span>
                      </motion.div>
                      <motion.div variants={rowV}>
                        <p className={label}>What kind of home</p>
                        <Glide id="enq-type" label="What kind of home" value={f.type} onChange={(v) => set({ type: v === f.type ? '' : v })} options={HOME_TYPES.map((t) => ({ id: t, label: t }))} />
                      </motion.div>
                      <motion.div variants={rowV}>
                        <p className={label}>What you want done</p>
                        <div className="flex flex-wrap gap-1.5">
                          {SCOPES.map((x) => {
                            const on = f.scope.includes(x);
                            return (
                              <motion.button whileTap={{ scale: 0.94 }} key={x} type="button" aria-pressed={on} onClick={() => set({ scope: on ? f.scope.filter((s) => s !== x) : [...f.scope, x] })}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{x}</motion.button>
                            );
                          })}
                        </div>
                      </motion.div>
                      <motion.div variants={rowV}>
                        <label htmlFor="enq-when" className={label}>When do you get the keys, or want to start</label>
                        <span className="relative block"><CalendarCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input id="enq-when" className={`${input} pl-9`} value={f.possession} onChange={(e) => set({ possession: e.target.value })} placeholder="e.g. January 2027" /></span>
                      </motion.div>
                      <motion.div variants={rowV}>
                        <label htmlFor="enq-msg" className={label}>Anything else</label>
                        <textarea id="enq-msg" className={`${input} min-h-[90px]`} maxLength={1000} value={f.message} onChange={(e) => set({ message: e.target.value })} placeholder="Tell us what you have in mind" />
                      </motion.div>
                      {/* A field people never see. Anything typed here was typed by a bot, and the server drops it. */}
                      <div aria-hidden className="absolute -left-[9999px] w-px h-px overflow-hidden">
                        <label htmlFor="enq-website">Website</label>
                        <input id="enq-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set({ website: e.target.value })} />
                      </div>
                    </motion.div>
                    {tried && problems.length > 0 && <p className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Please add {problems.join(' and ')}.</p>}
                    {error && <p role="alert" className="mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button type="submit" disabled={sending}
                        className="pp-press inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] transition-colors disabled:opacity-50">
                        <Send className="w-4 h-4" />{sending ? 'Sending…' : 'Send my enquiry'}
                      </button>
                      {door.phone && <a href={`https://wa.me/${door.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#3D52A0]"><MessageCircle className="w-4 h-4" />Or WhatsApp us</a>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-4">We use these details only to reply to you about your home.</p>
                  </form>
                )}
              </div>
            </motion.section>
          </Tilt>
        )}
      </div>
    </div>
  );
}
