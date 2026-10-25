import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useDragControls } from 'framer-motion';
import {
  UserPlus, Phone, MessageCircle, CalendarCheck, Ruler, FileText, Plus, Trophy, ThumbsDown, Filter, Check, X, AlertTriangle, Target,
  Hourglass, CircleCheck, CircleDot, Clock, Sparkles, Globe, MapPin, Building2, Wallet, AtSign, Send, ArrowLeft, Trash2, Search, Lock, ShieldCheck,
  StickyNote, Pin, PinOff, Pencil,
} from '@/lib/lucide-shim';
import { Dot, CountUp } from '../ui/HudBits';
import { Glide, IconTile, Tilt, DoneTick, Notice, listV, rowV } from '../people/PeopleBits';
import { dayKey, addDays } from '../../lib/opsDesk';
import {
  BOARD_STAGES, LEAD_STAGES, LEAD_SOURCES, SCOPES, LOST_REASONS, FIRST_CALL_MINUTES, QUIET_DAYS, QUIET_DAYS_LEAD,
  leadName, homeLine, leadUrgency, waitedLabel, sourceLabel, mainPerson, findMatches, conversionLines, leadStats, lostReasons, phoneKey, emailKey,
  blankDraft, blankPerson, draftProblems, isOpen, leadMeetingRows, LEAD_MEETING_ROW_LABEL, closeLeadMeeting, sortedNotes, addNote, editNote, removeNote, NOTE_MAX,
  type LeadMeetingRow, type LeadMeetingRowStatus, type LeadMeetingStatus, type LeadNote,
  type Lead, type LeadDraft, type LeadStage, type LeadSource, type TouchKind, type FirstStep, type LeadNext,
} from '../../lib/leads';
import { VISIT_MODES, visitCalendarEvent, visitCalendarMove, guestEmails, type VisitMode } from '../../lib/clientCare';
import { bookVisitCalendar, moveVisitCalendar } from '../../services/opsDeskService';
import { addCalendarAccount, isCalendarAccountLive } from '../../services/googleCalendarService';
import { CalendarStep, MeetLinkRow, calendarError, useCalendarAccounts } from './MeetLink';
import { createLead, saveLead, withTouch, readLeadChat, studioMatches, type StudioMatch } from '../../services/leadsService';
import { btnPri, btnSec, btnSm, input, Label, Seg } from './OpsDeskPanels';
import { useDesk, Panel, Chip, Avatar, Empty, EYEBROW, BRAND_EYEBROW, fmtDay, fmtWhen, dialable, waLink, cardV, type ChipTone } from './DeskBits';
import { clock12 } from '../../lib/peopleDesk';
import type { Person } from './OpsDeskPanels';
import { FormLinkSheet } from './FormLink';
import '../projectHeader/projectHeader.css';

/*
  LEADS ON THE OPS DESK (mockups L1 to L4). An enquiry from its first message
  to a project: a board by stage where each card says its next step and how
  urgent it is; adding one in under a minute; one lead with what we know,
  every touch and the next step; and asking a lead to open the project, which
  takes everything collected with it.
*/

const STAGE_ICON: Record<LeadStage, React.ComponentType<any>> = {
  new: UserPlus, talking: Phone, meeting: CalendarCheck, measured: Ruler, proposal: FileText, won: Trophy, lost: ThumbsDown,
};

/* ── L1: the board ───────────────────────────────────────────────────────── */

export function LeadsBoard({ onOpen, onAdd, onPaste, onMoved }: { onOpen: (id: string) => void; onAdd: () => void; onPaste: () => void; onMoved: (l: Lead) => void }) {
  const d = useDesk();
  /*
    Drag a card to another stage (with a mouse, trackpad or pen; on a phone,
    open the lead and tap its stage, so dragging never fights the page's
    scroll). The card lifts, the column under it lights up, and on letting go
    the lead moves at once and is saved, with the move in its touches. A
    person drags only the leads they may change.
  */
  const [dragFrom, setDragFrom] = useState<LeadStage | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [moved, setMoved] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const canMove = (l: Lead) => d.canWrite && (d.isLead || l.ownerEmail === d.me.email) && isOpen(l);
  const stageAt = (x: number, y: number): LeadStage | null => {
    const el = document.elementsFromPoint(x, y).find((e) => (e as HTMLElement).dataset?.stage) as HTMLElement | undefined;
    return (el?.dataset.stage as LeadStage) || null;
  };
  const drop = async (l: Lead, to: LeadStage | null) => {
    setDragFrom(null);
    setOver(null);
    if (!to || to === l.stage || !canMove(l)) return;
    const label = LEAD_STAGES.find((s) => s.id === to)?.label || to;
    const next = withTouch({ ...l, stage: to }, { kind: 'stage', text: `Moved to ${label}` }, d.me);
    onMoved(next);
    try {
      onMoved(await saveLead(next, d.me.email));
      setMoved({ text: `${leadName(l)} moved to ${label}.`, tone: 'ok' });
    } catch {
      onMoved(l);
      setMoved({ text: `${leadName(l)} could not be moved. Only its owner, or a lead, can change it.`, tone: 'bad' });
    }
    window.setTimeout(() => setMoved(null), 3200);
  };
  const [view, setView] = useState<'board' | 'list'>('board');
  const [whose, setWhose] = useState<'mine' | 'everyone'>(d.isLead ? 'everyone' : 'mine');
  const [source, setSource] = useState<LeadSource | 'all'>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const stats = leadStats(d.leads, d.now);
  const shown = d.leads.filter((l) => (whose === 'everyone' || l.ownerEmail === d.me.email) && (source === 'all' || l.source === source));
  const toCall = shown.filter((l) => isOpen(l) && !l.firstTouchAt).length;

  return (
    <div className="flex flex-col gap-5">
      <Panel icon={UserPlus} title="Leads" blurb="Every enquiry from its first message to a signed project. Add one in under a minute; the desk tells you who to call first."
        right={
          <div className="hidden md:grid grid-cols-4 gap-2">
            {([['New', stats.added], ['Meetings', stats.meetings], ['Won', stats.won], ['Avg first call', stats.avgFirstCallMin]] as [string, number | null][]).map(([k, v]) => (
              <Tilt key={k} max={8} className="rounded-xl">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-[84px]">
                  <p className="text-lg font-black text-slate-800 tabular-nums">{v == null ? '—' : k === 'Avg first call' && v >= 60 ? waitedLabel(v) : <><CountUp value={v} />{k === 'Avg first call' ? ' min' : ''}</>}</p>
                  <p className="text-[11px] text-slate-500">{k}{k === 'New' ? ' this month' : ''}</p>
                </div>
              </Tilt>
            ))}
          </div>
        }>
        <div className="flex flex-wrap items-center gap-2">
          {d.canWrite && <button type="button" data-tour="lead-board" className={`${btnPri} pp-press`} onClick={onAdd}><UserPlus className="w-4 h-4" />Add a lead</button>}
          {d.canWrite && <button type="button" className={btnSec} onClick={onPaste}><MessageCircle className="w-4 h-4" />From a WhatsApp chat</button>}
          <button type="button" className={btnSec} onClick={() => setFormOpen(true)}><Globe className="w-4 h-4" />Website form link</button>
          {toCall > 0 && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 ml-1"><Dot tone="warn" live />{toCall} to call now</span>}
        </div>
      </Panel>

      <AnimatePresence>{moved && <Notice text={moved.text} tone={moved.tone} onClose={() => setMoved(null)} />}</AnimatePresence>
      <div className="flex flex-wrap items-center gap-3">
        <Glide id="lead-view" label="View" value={view} onChange={setView} options={[{ id: 'board', label: 'Board' }, { id: 'list', label: 'List' }]} />
        {d.isLead && <Glide id="lead-whose" label="Whose" value={whose} onChange={setWhose} options={[{ id: 'mine', label: 'Mine' }, { id: 'everyone', label: 'Everyone' }]} />}
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-600">
          <Filter className="w-3.5 h-3.5" />Source:
          <select aria-label="Source" className="bg-transparent outline-none font-bold text-slate-700" value={source} onChange={(e) => setSource(e.target.value as any)}>
            <option value="all">all</option>
            {LEAD_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <span className="flex-1" />
        <span className="text-xs text-slate-500">{view === 'board' ? 'Drag a card to move it to another stage. ' : ''}Won and lost leads move to the list, and stay searchable.</span>
      </div>

      <AnimatePresence mode="wait">
        {view === 'board' ? (
          <motion.div key="board" initial={{ opacity: 0, rotateX: -10 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0 }} style={{ transformPerspective: 1400 }}>
            <LayoutGroup>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {BOARD_STAGES.map((st, ci) => {
                  const list = shown.filter((l) => l.stage === st);
                  const Icon = STAGE_ICON[st];
                  return (
                    <motion.div key={st} data-stage={st} initial={{ opacity: 0, y: 20, rotateY: -12 }}
                      animate={{ opacity: 1, y: 0, rotateY: 0, scale: over === st && dragFrom !== st ? 1.015 : 1 }} transition={{ delay: dragFrom ? 0 : ci * 0.06, duration: dragFrom ? 0.2 : 0.45 }}
                      style={{ transformPerspective: 1000, position: 'relative', zIndex: dragFrom === st ? 30 : 'auto' }}
                      className={`rounded-2xl border p-2.5 min-w-0 transition-colors ${over === st && dragFrom !== st ? 'bg-[#3D52A0]/5 border-[#3D52A0]/40 ring-2 ring-[#3D52A0]/20' : 'bg-slate-100/70 border-slate-200'}`}>
                      <p className="flex items-center gap-2 px-1 pb-2 text-sm font-bold text-slate-800"><Icon className="w-4 h-4 text-slate-400" />{LEAD_STAGES.find((s) => s.id === st)?.label}
                        <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white text-slate-600 tabular-nums">{list.length}</span></p>
                      <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
                        {list.map((l) => (
                          <LeadCard key={l.id} lead={l} onOpen={() => onOpen(l.id)} draggable={canMove(l)}
                            onDragStart={() => setDragFrom(l.stage)} onDragOver={(x, y) => setOver(stageAt(x, y))} onDrop={(x, y) => drop(l, stageAt(x, y))} />
                        ))}
                        {dragFrom && dragFrom !== st && over === st && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 44 }} className="rounded-xl border-2 border-dashed border-[#3D52A0]/40 text-xs font-bold text-[#3D52A0] grid place-items-center">Drop here</motion.div>
                        )}
                        {st === 'new' && d.canWrite && (
                          <button type="button" onClick={onAdd} className="rounded-xl border-2 border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 flex items-center gap-1.5 hover:border-[#3D52A0]/40 hover:text-[#3D52A0] transition-colors">
                            <Plus className="w-3.5 h-3.5" />Add a lead
                          </button>
                        )}
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>
            </LayoutGroup>
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, rotateX: -10 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0 }} style={{ transformPerspective: 1400 }}>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="relative max-w-sm mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className={`${input} pl-9`} placeholder="Search by name, phone or place" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
              </div>
              <LeadList leads={shown.filter((l) => {
                const s = search.trim().toLowerCase();
                return !s || [leadName(l), l.home.where, ...l.people.map((p) => `${p.name} ${p.phone} ${p.email}`)].join(' ').toLowerCase().includes(s);
              })} onOpen={onOpen} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={cardV} initial="hidden" animate="show" className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <Trophy className="w-4 h-4 text-emerald-600" /><span><b className="text-slate-800">Won this month:</b> {stats.wonList.length ? stats.wonList.map(leadName).join(', ') : 'none yet'}</span>
        <span className="w-px h-4 bg-slate-200" />
        <ThumbsDown className="w-4 h-4 text-slate-400" /><span><b className="text-slate-800">Lost:</b> {stats.lost.length}{stats.lost.length ? ` · ${lostReasons(stats.lost)}` : ''}</span>
      </motion.div>
      {formOpen && <FormLinkSheet onClose={() => setFormOpen(false)} />}
    </div>
  );
}

const LeadCard: React.FC<{
  lead: Lead; onOpen: () => void; draggable: boolean;
  onDragStart: () => void; onDragOver: (x: number, y: number) => void; onDrop: (x: number, y: number) => void;
}> = ({ lead: l, onOpen, draggable, onDragStart, onDragOver, onDrop }) => {
  const d = useDesk();
  const controls = useDragControls();
  /* A drag ends with a click on the card under the pointer: that click must not open the lead. */
  const dragged = useRef(false);
  const u = leadUrgency(l, d.now);
  const chip = !l.firstTouchAt && u.waitedMin != null
    ? <Chip tone={u.waitedMin >= FIRST_CALL_MINUTES ? 'rose' : 'amber'}>{waitedLabel(u.waitedMin)}</Chip>
    : l.source === 'referral' ? <Chip tone="brand">Referral</Chip>
      : l.stage === 'measured' ? <Chip tone="emerald">{l.openRequest ? 'Asked to open' : 'Ready'}</Chip> : null;
  return (
    <motion.div variants={rowV} layoutId={`lead-${l.id}`} style={{ position: 'relative' }}
      drag={draggable} dragControls={controls} dragListener={false} dragSnapToOrigin dragMomentum={false} dragElastic={0.9}
      onPointerDown={(e) => { if (draggable && e.pointerType !== 'touch') controls.start(e); }}
      onDragStart={() => { dragged.current = true; onDragStart(); }}
      onDrag={(_, info) => onDragOver(info.point.x - window.scrollX, info.point.y - window.scrollY)}
      onDragEnd={(_, info) => { onDrop(info.point.x - window.scrollX, info.point.y - window.scrollY); window.setTimeout(() => { dragged.current = false; }, 0); }}
      whileDrag={{ scale: 1.06, rotate: -2.5, rotateX: 10, zIndex: 50, boxShadow: '0 24px 40px -18px rgba(61, 82, 160, 0.55)', cursor: 'grabbing' }}
      className={draggable ? 'cursor-grab rounded-xl' : 'rounded-xl'}>
      <Tilt max={6} className="rounded-xl">
        <button type="button" onClick={() => { if (!dragged.current) onOpen(); }} className="w-full text-left rounded-xl bg-white border border-slate-200 shadow-sm p-3 hover:border-[#3D52A0]/40 transition-colors">
          <span className="flex items-start gap-2"><span className="text-sm font-bold text-slate-800 flex-1 min-w-0 truncate">{leadName(l)}</span>{chip}</span>
          <span className="block text-[11px] text-slate-500 mt-0.5 truncate">{homeLine(l.home) || 'Home not filled in'}</span>
          <span className="block text-[11px] text-slate-500 truncate">{sourceLabel(l.source)}{l.sourceNote ? ` · ${l.sourceNote}` : ''}</span>
          <span className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
            <Dot tone={u.tone} live={u.tone === 'bad'} /><span className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">{u.label}</span><Avatar name={l.ownerName || l.ownerEmail} />
          </span>
        </button>
      </Tilt>
    </motion.div>
  );
};

function LeadList({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const d = useDesk();
  if (!leads.length) return <Empty icon={UserPlus} text="No leads here yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead><tr className={`${EYEBROW} text-left`}><th className="py-2 px-2">Lead</th><th className="px-2">Stage</th><th className="px-2">Source</th><th className="px-2">Owner</th><th className="px-2">Came in</th></tr></thead>
        <motion.tbody variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100">
          {leads.map((l) => {
            const u = leadUrgency(l, d.now);
            return (
              <motion.tr variants={rowV} key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(l.id)}>
                <td className="py-2.5 px-2"><span className="flex items-center gap-2"><Dot tone={u.tone} /><span><b className="font-semibold text-slate-800">{leadName(l)}</b><span className="block text-[11px] text-slate-500">{homeLine(l.home)}</span></span></span></td>
                <td className="px-2">{l.stage === 'won' ? <Chip tone="emerald">Won</Chip> : l.stage === 'lost' ? <Chip>Lost{l.lostReason ? ` · ${l.lostReason}` : ''}</Chip> : <Chip tone="brand">{LEAD_STAGES.find((s) => s.id === l.stage)?.label}</Chip>}</td>
                <td className="px-2 text-xs text-slate-600">{sourceLabel(l.source)}</td>
                <td className="px-2 text-xs text-slate-600">{l.ownerName || l.ownerEmail}</td>
                <td className="px-2 text-xs text-slate-500">{fmtWhen(l.createdAt)}</td>
              </motion.tr>
            );
          })}
        </motion.tbody>
      </table>
    </div>
  );
}

/* ── L2: adding a lead ───────────────────────────────────────────────────── */

export function AddLeadSheet({ owners, paste, onClose, onCreated, onOpenExisting }: {
  owners: Person[];
  paste?: boolean;
  onClose: () => void;
  onCreated: (l: Lead) => void;
  onOpenExisting: (id: string) => void;
}) {
  const d = useDesk();
  const [draft, setDraft] = useState<LeadDraft>(() => blankDraft(d.now));
  const [owner, setOwner] = useState(d.me.email);
  const [pasting, setPasting] = useState(!!paste);
  const [chat, setChat] = useState('');
  const [reading, setReading] = useState(false);
  const [notThem, setNotThem] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    "We may know them": at once from what this person can see, then from the
    whole studio (functions/src/leads.ts leadMatches), which also finds
    another person's lead or a client this person is not assigned to.
  */
  const local = useMemo(() => findMatches(draft.people, d.leads, d.projects.map((p) => p.raw)), [draft.people, d.leads, d.projects]);
  const contactKey = draft.people.map((p) => `${phoneKey(p.phone)}|${emailKey(p.email)}`).join(',');
  const [remote, setRemote] = useState<StudioMatch[]>([]);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const people = draft.people.map((p) => ({ phone: p.phone, email: p.email })).filter((p) => phoneKey(p.phone) || emailKey(p.email).includes('@'));
    if (!people.length) { setRemote([]); return; }
    let live = true;
    const t = window.setTimeout(async () => {
      setChecking(true);
      const r = await studioMatches(people);
      if (live) { if (r) setRemote(r); setChecking(false); }
    }, 700);
    return () => { live = false; window.clearTimeout(t); };
  }, [contactKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches: StudioMatch[] = useMemo(() => {
    const out: StudioMatch[] = local.map((m) => ({ ...m, mine: true }));
    for (const r of remote) {
      const i = out.findIndex((m) => m.kind === r.kind && m.id === r.id);
      if (i >= 0) out[i] = { ...r, ...out[i], ownerName: r.ownerName, mine: true };
      else out.push(r);
    }
    return out.filter((m) => !notThem.includes(m.id)).slice(0, 4);
  }, [local, remote, notThem]);
  const problems = draftProblems(draft);
  const set = (patch: Partial<LeadDraft>) => setDraft({ ...draft, ...patch });
  const setPerson = (i: number, patch: Partial<LeadDraft['people'][number]>) => set({ people: draft.people.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setHome = (patch: Partial<LeadDraft['home']>) => set({ home: { ...draft.home, ...patch } });

  const readIt = async () => {
    if (!chat.trim()) return;
    setReading(true);
    try {
      const r = await readLeadChat(chat);
      setDraft({
        ...draft,
        people: r.people.length ? r.people.map((p, i) => ({ ...blankPerson(i === 0), name: p.name, phone: p.phone, email: p.email, role: p.role || (i === 0 ? 'Main contact' : '') })) : draft.people,
        home: { where: r.where || draft.home.where, type: r.type || draft.home.type, area: r.area || draft.home.area, scope: r.scope.length ? r.scope : draft.home.scope, possession: r.possession || draft.home.possession, budget: r.budget || draft.home.budget },
        enquiry: r.enquiry || draft.enquiry,
      });
      setPasting(false);
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const o = owners.find((x) => x.email === owner) || d.me;
      const l = await createLead(draft, { tenantId: d.tenantId, me: d.me, owner: o });
      onCreated(l);
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'The lead was not saved: leads may not be switched on for this studio yet (the new database rules).' : 'The lead was not saved. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Add a lead">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-6xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 pt-5 pb-4 flex items-start gap-3">
          <div className="flex-1">
            <p className={BRAND_EYEBROW}>New lead</p>
            <h3 className="text-lg font-bold text-slate-800">Who is asking, and about what?</h3>
            <p className="text-xs text-slate-500">Only the name and one way to reach them are needed now. The rest can wait for the first call.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 pb-5 overflow-y-auto">
          <AnimatePresence>
            {pasting && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/5 p-4 mb-5">
                  <Label htmlFor="lead-chat">Paste the WhatsApp chat</Label>
                  <textarea id="lead-chat" className={`${input} min-h-[110px] text-xs`} value={chat} onChange={(e) => setChat(e.target.value)}
                    placeholder="[19/10/26, 10:02 AM] Rohan Mehta: Hi, need interiors for our new 3 BHK in Powai…" />
                  <div className="flex gap-2 mt-2">
                    <button type="button" className={btnPri} disabled={!chat.trim() || reading} onClick={readIt}><Sparkles className="w-4 h-4" />{reading ? 'Reading…' : 'Fill the fields from it'}</button>
                    <button type="button" className={btnSec} onClick={() => setPasting(false)}>Type it instead</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_340px] gap-5">
            <div className="flex flex-col gap-3">
              <p className={EYEBROW}>The people</p>
              <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-3">
                {draft.people.map((p, i) => (
                  <motion.div variants={rowV} key={p.id} className="rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={p.name || '?'} client />
                      <input aria-label="Name" className={`${input} !py-1.5 font-bold`} placeholder={i === 0 ? 'Mr Rohan Mehta' : 'Name'} value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} />
                      {i === 0 ? <Chip tone="brand">Main contact</Chip> : (
                        <button type="button" aria-label="Remove this person" className="p-1 text-slate-400 hover:text-rose-600" onClick={() => set({ people: draft.people.filter((_, j) => j !== i) })}><X className="w-4 h-4" /></button>
                      )}
                    </div>
                    {i > 0 && <input aria-label="Who they are" className={`${input} !py-1.5 text-xs`} placeholder="Decides with him, Father, Their architect…" value={p.role} onChange={(e) => setPerson(i, { role: e.target.value })} />}
                    <span className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input aria-label="Phone" type="tel" className={`${input} pl-9 !py-1.5`} placeholder="+91 98330 12345" value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} />
                      {p.phone.replace(/\D/g, '').length >= 10 && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-700 inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />WhatsApp</span>}
                    </span>
                    <span className="relative">
                      <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input aria-label="Email" type="email" className={`${input} pl-9 !py-1.5`} placeholder="Email" value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} />
                    </span>
                  </motion.div>
                ))}
              </motion.div>
              {draft.people.length < 6 && (
                <button type="button" className="text-xs font-bold text-[#3D52A0] inline-flex items-center gap-1 self-start" onClick={() => set({ people: [...draft.people, blankPerson(false)] })}>
                  <Plus className="w-3.5 h-3.5" />Add another person (spouse, parent, architect)
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <p className={EYEBROW}>The home</p>
              <IconField label="Where" icon={MapPin} value={draft.home.where} placeholder="Hiranandani, Powai · Tower B, 1402" onChange={(v) => setHome({ where: v })} />
              <div className="grid grid-cols-2 gap-3">
                <IconField label="Type" icon={Building2} value={draft.home.type} placeholder="3 BHK" onChange={(v) => setHome({ type: v })} />
                <IconField label="Carpet area" icon={Ruler} value={draft.home.area ? String(draft.home.area) : ''} placeholder="1150 sq ft" onChange={(v) => setHome({ area: Number(v.replace(/[^\d]/g, '')) || null })} />
              </div>
              <div>
                <Label>What they want done</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SCOPES.map((x) => {
                    const on = draft.home.scope.includes(x);
                    return (
                      <motion.button whileTap={{ scale: 0.94 }} key={x} type="button" aria-pressed={on} onClick={() => setHome({ scope: on ? draft.home.scope.filter((s) => s !== x) : [...draft.home.scope, x] })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{x}</motion.button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <IconField label="Possession / start" icon={CalendarCheck} value={draft.home.possession} placeholder="Jan 2027" onChange={(v) => setHome({ possession: v })} />
                <IconField label="Budget they said" icon={Wallet} value={draft.home.budget} placeholder="₹25–30 L" onChange={(v) => setHome({ budget: v })} />
              </div>
              <div>
                <Label>How they found us</Label>
                <Glide id="lead-source" label="How they found us" value={draft.source} onChange={(v) => set({ source: v })} options={LEAD_SOURCES.filter((s) => s.id !== 'repeat')} />
                {(draft.source === 'referral' || draft.source === 'architect' || draft.source === 'other') && (
                  <input aria-label="Who" className={`${input} mt-2 !py-1.5 text-xs`} placeholder={draft.source === 'referral' ? 'Referred by (e.g. Mr Naik)' : draft.source === 'architect' ? 'Which architect' : 'Where from'} value={draft.sourceNote} onChange={(e) => set({ sourceNote: e.target.value })} />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {checking && !matches.length && <p className="flex items-center gap-2 text-[11px] text-slate-500"><Dot tone="warn" live />Checking the studio’s leads and clients…</p>}
              <AnimatePresence>
                {matches.map((m) => (
                  <motion.div key={m.id} initial={{ opacity: 0, rotateX: -30, y: -6 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} exit={{ opacity: 0, height: 0 }} style={{ transformPerspective: 800 }}
                    className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <p className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />We may know them</p>
                    <p className="text-xs text-amber-900 mt-1"><b>{m.name}</b>, same {m.by}, {m.detail}{m.kind === 'lead' && m.ownerName && !m.mine ? ` ${m.ownerName} has this lead.` : ''}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {m.kind === 'lead' && m.mine && <button type="button" className={btnSm} onClick={() => onOpenExisting(m.id)}>Open it again</button>}
                      {m.kind === 'lead' && !m.mine && <span className="text-[11px] font-semibold text-amber-900">Check with {m.ownerName ? m.ownerName.split(' ')[0] : 'its owner'} before adding it again.</span>}
                      {m.kind === 'client' && m.mine && d.projects.some((p) => p.id === m.id) && <button type="button" className={btnSm} onClick={() => d.act.openClient(m.id)}>See the client</button>}
                      {m.kind === 'client' && !m.mine && <span className="text-[11px] font-semibold text-amber-900">A client of the studio: check with a lead.</span>}
                      <button type="button" className={btnSm} onClick={() => setNotThem([...notThem, m.id])}>It is someone else</button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="group rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <IconTile icon={Target} size="sm" className="!w-9 !h-9 !rounded-xl" />
                  <div><p className="font-bold text-slate-800">First step</p><p className="text-xs text-slate-500">Every lead has a next step and a date</p></div>
                </div>
                <Glide id="lead-first" label="First step" value={draft.next.kind} onChange={(k: FirstStep) => set({ next: { ...draft.next, kind: k, text: k === 'call' ? 'Call to understand the brief' : k === 'whatsapp' ? 'Send our work on WhatsApp' : 'Book a studio meeting' } })}
                  options={[{ id: 'call', label: 'Call' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'meeting', label: 'Book a meeting' }]} />
                <input aria-label="Next step" className={`${input} mt-2`} value={draft.next.text} onChange={(e) => set({ next: { ...draft.next, text: e.target.value } })} />
                <input aria-label="By when" type="date" className={`${input} mt-2`} min={dayKey(d.now)} value={draft.next.due} onChange={(e) => set({ next: { ...draft.next, due: e.target.value } })} />
                <Label htmlFor="lead-owner"><span className="block mt-3">Owner</span></Label>
                <select id="lead-owner" className={input} value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!d.isLead}>
                  {[d.me, ...owners.filter((o) => o.email !== d.me.email)].map((o) => <option key={o.email} value={o.email}>{o.email === d.me.email ? `Me (${o.name})` : o.name}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-slate-500">The budget is what the client said. It is kept with the lead for the people working it to see, and never printed.</p>
            </div>
          </div>
          {error && <p className="mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-500 flex-1 inline-flex items-center gap-1.5">
            {problems.length ? `Still needed: ${problems.join(', ')}.` : <><Sparkles className="w-3.5 h-3.5 text-[#3D52A0]" />{pasting ? 'Paste the chat above, then check the fields.' : <button type="button" className="font-bold text-[#3D52A0]" onClick={() => setPasting(true)}>Or paste the WhatsApp chat and the fields fill themselves; you check them.</button>}</>}
          </span>
          <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
          <button type="button" className={`${btnPri} pp-press`} disabled={saving || problems.length > 0} onClick={save}><Check className="w-4 h-4" />{saving ? 'Adding…' : 'Add the lead'}</button>
        </div>
      </div>
    </div>
  );
}

const IconField: React.FC<{ label: string; icon: React.ComponentType<any>; value: string; placeholder: string; onChange: (v: string) => void }> = ({ label, icon: Icon, value, placeholder, onChange }) => (
  <label className="block">
    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{label}</span>
    <span className="relative block">
      <Icon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input className={`${input} pl-9`} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

/* ── L3: one lead ────────────────────────────────────────────────────────── */

export function LeadPage({ lead: l, owners, opener, onBack, onSaved, onDelete, onOpenProject }: {
  lead: Lead;
  owners: Person[];
  /** The lead who opens projects, by name. */
  opener: string;
  onBack: () => void;
  onSaved: (l: Lead) => void;
  onDelete: (l: Lead) => void;
  onOpenProject: (l: Lead) => void;
}) {
  const d = useDesk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchKind, setTouchKind] = useState<TouchKind>('call');
  const [reached, setReached] = useState(true);
  const [text, setText] = useState('');
  const [editNext, setEditNext] = useState(false);
  const [next, setNext] = useState<LeadNext>(l.next || { text: '', due: addDays(dayKey(d.now), 1), kind: 'call' as FirstStep });
  /* A meeting booked with the lead: on Google Calendar with a Meet link, as on Meetings & visits (MeetLink.tsx). */
  const calendars = useCalendarAccounts();
  const booked = l.next?.kind === 'meeting' && l.next.calendarEventId ? l.next : null;
  const meeting = next.kind === 'meeting';
  const slotOf = (n: LeadNext) => (n.time && /^\d{4}-\d{2}-\d{2}$/.test(n.due) ? { date: n.due, time: n.time } : null);
  const meetSlot = meeting ? slotOf(next) : null;
  const moved = !!booked && !!meetSlot && (booked.due !== meetSlot.date || booked.time !== meetSlot.time);
  const calMode: 'create' | 'move' | null = !meeting || !meetSlot ? null : booked ? (booked.calendarAccount && moved ? 'move' : null) : 'create';
  const [calOn, setCalOn] = useState(false);
  const [calAccount, setCalAccount] = useState(calendars.active || '');
  useEffect(() => { if (!calAccount && calendars.active) setCalAccount(calendars.active); }, [calendars.active, calAccount]);
  const [guests, setGuests] = useState(mainPerson(l)?.email || '');
  useEffect(() => { setCalOn(booked ? true : next.mode === 'video'); }, [next.mode, !!booked]); // eslint-disable-line react-hooks/exhaustive-deps
  const [losing, setLosing] = useState(false);
  /* Closing out a booked meeting: held, did not happen, or cancelled, with what came of it. */
  const [closing, setClosing] = useState<LeadMeetingStatus | null>(null);
  const [outcome, setOutcome] = useState('');
  const main = mainPerson(l);
  const u = leadUrgency(l, d.now);
  const mine = l.ownerEmail === d.me.email;
  const canEdit = d.canWrite && (d.isLead || mine);
  const stageIx = LEAD_STAGES.findIndex((s) => s.id === l.stage);

  const commit = async (next: Lead) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveLead(next, d.me.email));
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'Only the owner of the lead, or a lead, can change it.' : 'That was not saved. Try again.');
    } finally {
      setBusy(false);
    }
  };
  /** Save the next step; a meeting goes on Google Calendar first, signing in before anything else so the window may open. */
  const saveNext = async () => {
    const clean: LeadNext = meeting
      ? { ...next, text: next.text.trim(), time: next.time || null, mode: next.mode || 'in_person', meetUrl: next.meetUrl ?? null, calendarEventId: next.calendarEventId ?? null, calendarAccount: next.calendarAccount ?? null }
      : { text: next.text.trim(), due: next.due, kind: next.kind };
    if (calMode && calOn && meetSlot) {
      setBusy(true);
      setError(null);
      try {
        let acct = calMode === 'move' ? booked!.calendarAccount! : calAccount;
        if (!isCalendarAccountLive(acct)) {
          const signed = await addCalendarAccount(acct || undefined);
          if (acct && signed.email !== acct) { setError(`You signed in as ${signed.email}, not ${acct}. Sign in as ${acct}, or untick the calendar box.`); setBusy(false); return; }
          acct = signed.email;
        }
        if (calMode === 'create') {
          const list = guestEmails(guests);
          const event = visitCalendarEvent({ kind: 'meeting', mode: clean.mode as VisitMode, purpose: clean.text, slot: meetSlot }, {
            projectName: `${leadName(l)} (enquiry)`, clientName: mainPerson(l)?.name || '', guests: list,
            requestId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
          });
          const cal = await bookVisitCalendar(acct!, event, list.length > 0);
          Object.assign(clean, { meetUrl: cal.meetUrl, calendarEventId: cal.calendarEventId, calendarAccount: cal.calendarAccount });
        } else {
          await moveVisitCalendar(acct!, booked!.calendarEventId!, visitCalendarMove(meetSlot));
        }
      } catch (e: any) {
        setError(`${calendarError(e)} Untick the calendar box to save without it.`);
        setBusy(false);
        return;
      }
    }
    setEditNext(false);
    commit({ ...l, next: clean, stage: clean.kind === 'meeting' && (l.stage === 'new' || l.stage === 'talking') ? 'meeting' : l.stage });
  };
  const moveTo = (s: LeadStage) => {
    if (!canEdit || s === l.stage || s === 'won') return;
    commit(withTouch({ ...l, stage: s }, { kind: 'stage', text: `Moved to ${LEAD_STAGES.find((x) => x.id === s)?.label}` }, d.me));
  };
  const logTouch = async () => {
    if (!text.trim() && touchKind !== 'call') return;
    const words = text.trim() || (reached ? 'Called' : 'Called, no answer');
    await commit(withTouch(l, { kind: touchKind, text: words, reached: touchKind === 'call' ? reached : null }, d.me));
    setText('');
  };
  const know: [string, React.ReactNode, boolean, (v: string) => Lead][] = [
    ['Who decides', l.know.decides || 'Not asked yet', !!l.know.decides, (v) => ({ ...l, know: { ...l.know, decides: v } })],
    ['Possession', l.home.possession || 'Not asked yet', !!l.home.possession, (v) => ({ ...l, home: { ...l.home, possession: v } })],
    ['Budget they said', l.home.budget || 'Not asked yet', !!l.home.budget, (v) => ({ ...l, home: { ...l.home, budget: v } })],
    ['Rooms', l.home.scope.join(', ') || 'Not asked yet', l.home.scope.length > 0, (v) => ({ ...l, home: { ...l.home, scope: v.split(',').map((x) => x.trim()).filter(Boolean) } })],
    ['Style', l.know.style || 'Not asked yet', !!l.know.style, (v) => ({ ...l, know: { ...l.know, style: v } })],
  ];
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  return (
    <div className="flex flex-col gap-5">
      <motion.div variants={cardV} initial="hidden" animate="show" className="group pp-glass rounded-2xl p-5 relative overflow-hidden">
        <span className="pp-glow" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <button type="button" onClick={onBack} aria-label="Back to the board" className="p-2 rounded-xl text-slate-500 hover:bg-white/70"><ArrowLeft className="w-4 h-4" /></button>
          <Avatar name={leadName(l)} client size="md" />
          <div className="flex-1 min-w-0">
            <p className={BRAND_EYEBROW}>Lead · {sourceLabel(l.source)}{l.sourceNote ? ` · ${l.sourceNote}` : ''} · {fmtDay(dayKey(l.createdAt))}</p>
            <h3 className="text-xl font-bold text-slate-800">{leadName(l)}{l.home.type || l.home.where ? ` · ${[l.home.type, l.home.where.split(/[·,]/).slice(-1)[0]?.trim()].filter(Boolean).join(', ')}` : ''}</h3>
            <p className="text-xs text-slate-500">{l.people.map((p) => p.name).filter(Boolean).join(' and ')}{l.home.possession ? ` · possession ${l.home.possession}` : ''} · owner {l.ownerName || l.ownerEmail}</p>
          </div>
          {main?.phone && <a href={`tel:+${dialable(main.phone)}`} className={`${btnPri} !py-1.5 !text-xs pp-press`} onClick={() => setTouchKind('call')}><Phone className="w-3.5 h-3.5" />Call</a>}
          {main?.phone && <a href={waLink(main.phone, `Hi ${main.name}, this is ${d.me.name} from ${d.studioName || 'the studio'}.`)} target="_blank" rel="noreferrer" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => setTouchKind('whatsapp')}><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>}
          {canEdit && isOpen(l) && <button type="button" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => { setNext({ text: 'Studio meeting', due: addDays(dayKey(d.now), 2), kind: 'meeting' }); setEditNext(true); }}><CalendarCheck className="w-3.5 h-3.5" />Book a meeting</button>}
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center gap-1.5">
        {LEAD_STAGES.map((s, i) => {
          const done = l.stage !== 'lost' && i < stageIx;
          const on = s.id === l.stage;
          return (
            <React.Fragment key={s.id}>
              <motion.button type="button" whileHover={canEdit && s.id !== 'won' ? { y: -2 } : undefined} whileTap={{ scale: 0.95 }} disabled={!canEdit || s.id === 'won' || busy} onClick={() => moveTo(s.id)}
                className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${on ? 'text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'} disabled:cursor-default`}>
                {on && <motion.span layoutId="lead-stage" className="absolute inset-0 rounded-full bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                <span className="relative inline-flex items-center gap-1.5">{done ? <Check className="w-3 h-3" /> : <span className="tabular-nums">{i + 1}</span>}{s.label}</span>
              </motion.button>
              {i < LEAD_STAGES.length - 1 && <span className="w-4 h-px bg-slate-300" />}
            </React.Fragment>
          );
        })}
        <span className="flex-1" />
        {l.stage === 'lost' && <Chip>Lost{l.lostReason ? ` · ${l.lostReason}` : ''}</Chip>}
        {canEdit && isOpen(l) && !losing && <button type="button" className={btnSm} onClick={() => setLosing(true)}><ThumbsDown className="w-3.5 h-3.5" />Mark as lost</button>}
        {canEdit && l.stage === 'lost' && <button type="button" className={btnSm} onClick={() => commit(withTouch({ ...l, stage: 'talking', lostReason: null }, { kind: 'stage', text: 'Opened again' }, d.me))}>Open it again</button>}
        {losing && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {LOST_REASONS.map((r) => <button key={r} type="button" className={btnSm} onClick={() => { setLosing(false); commit(withTouch({ ...l, stage: 'lost', lostReason: r, next: null }, { kind: 'stage', text: `Lost: ${r}` }, d.me)); }}>{r}</button>)}
            <button type="button" aria-label="Cancel" className="p-1 text-slate-400" onClick={() => setLosing(false)}><X className="w-4 h-4" /></button>
          </span>
        )}
      </div>
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
        <Panel icon={CircleCheck} title="What we know" blurb="Ask these on the first call; the project brief fills from them">
          <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2 text-sm">
            {know.map(([k, v, ok, apply]) => (
              <motion.li variants={rowV} key={k} className="flex items-start gap-2">
                {ok ? <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <CircleDot className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                <span className="w-28 text-slate-500 text-xs pt-0.5 shrink-0">{k}</span>
                {editing === k ? (
                  <form className="flex-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); setEditing(null); commit(apply(editVal.trim())); }}>
                    <input autoFocus aria-label={k} className={`${input} !py-1 text-xs`} value={editVal} onChange={(e) => setEditVal(e.target.value)} />
                    <button type="submit" className={btnSm} aria-label="Save"><Check className="w-3.5 h-3.5" /></button>
                  </form>
                ) : (
                  <button type="button" disabled={!canEdit} onClick={() => { setEditing(k); setEditVal(ok ? String(v) : ''); }}
                    className={`flex-1 text-left ${ok ? 'text-slate-800' : 'text-amber-800 font-semibold'} ${canEdit ? 'hover:underline decoration-dotted' : ''}`}>{v}</button>
                )}
              </motion.li>
            ))}
            <motion.li variants={rowV} className="flex items-start gap-2">
              {l.know.seenWork ? <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <CircleDot className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              <span className="w-28 text-slate-500 text-xs pt-0.5 shrink-0">Seen our work</span>
              <button type="button" disabled={!canEdit} onClick={() => commit({ ...l, know: { ...l.know, seenWork: !l.know.seenWork } })} className={`flex-1 text-left ${l.know.seenWork ? 'text-slate-800' : 'text-amber-800 font-semibold'}`}>{l.know.seenWork ? 'Yes' : 'Not yet'}</button>
            </motion.li>
          </motion.ul>
          {l.people.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1.5">
              {l.people.map((p) => (
                <p key={p.id} className="text-xs text-slate-600"><b className="text-slate-800">{p.name || 'No name'}</b>{p.role ? ` · ${p.role}` : ''}{p.phone ? ` · ${p.phone}` : ''}{p.email ? ` · ${p.email}` : ''}</p>
              ))}
            </div>
          )}
        </Panel>
        <LeadNotes lead={l} canEdit={canEdit} busy={busy} onChange={commit} />
        </div>

        <Panel icon={Clock} title="Every touch" blurb="Calls, messages and meetings, newest first. Notes have their own card.">
          {canEdit && isOpen(l) && (
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-3 mb-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Glide id="touch-kind" label="What it was" value={touchKind} onChange={setTouchKind}
                  options={[{ id: 'call', label: 'Call' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'meeting', label: 'Meeting' }]} />
                {touchKind === 'call' && <Glide id="touch-reached" label="Answered" value={reached ? 'yes' : 'no'} onChange={(v) => setReached(v === 'yes')} options={[{ id: 'yes', label: 'Reached' }, { id: 'no', label: 'No answer' }]} />}
              </div>
              <input aria-label="What was said" className={`${input} !py-1.5`} placeholder={touchKind === 'call' ? 'Brief and budget, 12 min' : touchKind === 'meeting' ? 'Walked through the moodboard at the studio' : 'What was said'} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') logTouch(); }} />
              <button type="button" className={`${btnSm} self-end`} disabled={busy || (!text.trim() && touchKind !== 'call')} onClick={logTouch}><Check className="w-3.5 h-3.5" />Save to the lead</button>
            </div>
          )}
          {!l.touches.length ? <p className="text-xs text-slate-500">Nothing yet.</p> : (
            <motion.ol variants={listV} initial="hidden" animate="show" className="relative border-l border-slate-200 ml-2 flex flex-col gap-3">
              {[...l.touches].reverse().slice(0, 40).map((t) => (
                <motion.li variants={rowV} key={t.id} className="pl-4 relative">
                  <span style={{ left: -5 }} className={`absolute top-1.5 w-2.5 h-2.5 rounded-full ${t.kind === 'call' ? (t.reached ? 'bg-emerald-500' : 'bg-amber-500') : t.kind === 'stage' || t.kind === 'note' ? 'bg-slate-300' : 'bg-[#3D52A0]'}`} />
                  <p className="text-sm font-semibold text-slate-800">{t.kind === 'call' ? `Called: ${t.text}` : t.kind === 'whatsapp' ? `WhatsApp: ${t.text}` : t.kind === 'meeting' ? `Meeting: ${t.text}` : t.text}</p>
                  <p className="text-[11px] text-slate-500">{t.byName} · {fmtWhen(t.at)}{t.kind === 'call' ? (t.reached ? ' · reached' : ' · no answer') : ''}</p>
                </motion.li>
              ))}
            </motion.ol>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel icon={Target} title="Next step" blurb="Shows on your Today list">
            {editNext || !l.next ? (
              canEdit && isOpen(l) ? (
                <div className="flex flex-col gap-2">
                  <input aria-label="Next step" className={input} placeholder="Book a studio meeting" value={next.text} onChange={(e) => setNext({ ...next, text: e.target.value })} />
                  <input aria-label="By when" type="date" className={input} value={next.due} onChange={(e) => setNext({ ...next, due: e.target.value })} />
                  {meeting && (
                    <>
                      <input aria-label="Time" type="time" className={input} value={next.time || ''} onChange={(e) => setNext({ ...next, time: e.target.value || null })} />
                      <Seg label="How" value={next.mode || 'in_person'} onChange={(m: VisitMode) => setNext({ ...next, mode: m })} options={VISIT_MODES} />
                      {!meetSlot && <p className="text-[11px] text-slate-500">Add a time to put it on Google Calendar{next.mode === 'video' ? ' with a Meet link' : ''}.</p>}
                      {calMode && (
                        <CalendarStep id="lead-cal" on={calOn} onToggle={setCalOn} video={next.mode === 'video'} account={calAccount} onAccount={setCalAccount} onError={setError}
                          fixed={calMode === 'move' ? booked!.calendarAccount : null}
                          label={calMode === 'move' ? 'Move it on Google Calendar too' : next.mode === 'video' ? 'Create a Google Meet link and put it on Google Calendar' : 'Put it on Google Calendar'}
                          guests={calMode === 'create' ? guests : undefined} onGuests={calMode === 'create' ? setGuests : undefined} />
                      )}
                    </>
                  )}
                  <div className="flex gap-2">
                    <button type="button" className={btnSm} disabled={!next.text.trim() || busy} onClick={saveNext}><Check className="w-3.5 h-3.5" />Save</button>
                    {l.next && <button type="button" className={btnSm} onClick={() => setEditNext(false)}>Cancel</button>}
                  </div>
                </div>
              ) : <p className="text-xs text-slate-500">No next step.</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">{l.next.text}</p>
                <p className="text-xs text-slate-500">{l.ownerName} · {l.next.kind === 'meeting' && l.next.time ? `${fmtDay(l.next.due)}, ${clock12(l.next.time)}${l.next.mode ? ` · ${VISIT_MODES.find((m) => m.id === l.next!.mode)?.label}` : ''}` : `by ${fmtDay(l.next.due)}`} {u.tone === 'bad' && <Chip tone="rose">Overdue</Chip>}</p>
                {l.next.meetUrl && <div className="mt-2"><MeetLinkRow url={l.next.meetUrl} onError={setError} /></div>}
                {canEdit && l.next.kind === 'meeting' && (
                  /* A meeting is closed out, not ticked: it stays on the Ops Desk's table of meetings with leads. */
                  closing ? (
                    <form className="flex flex-col gap-2 mt-3" onSubmit={(e) => {
                      e.preventDefault();
                      const status = closing;
                      setClosing(null);
                      setNext({ text: '', due: addDays(dayKey(d.now), 2), kind: 'call' });
                      setEditNext(true);
                      commit(closeLeadMeeting(l, status, outcome, d.me, Date.now()));
                      setOutcome('');
                    }}>
                      <Label htmlFor="lead-outcome">{closing === 'done' ? 'What came of it' : 'Why'} <span className="normal-case font-semibold text-slate-400">(optional)</span></Label>
                      <input id="lead-outcome" autoFocus className={input} value={outcome} maxLength={300} onChange={(e) => setOutcome(e.target.value)}
                        placeholder={closing === 'done' ? 'Liked the samples; wants a site measure next week' : closing === 'missed' ? 'They did not turn up; called, no answer' : 'They asked to call off for now'} />
                      <div className="flex gap-2">
                        <button type="submit" className={btnSm} disabled={busy}><Check className="w-3.5 h-3.5" />Save</button>
                        <button type="button" className={btnSm} onClick={() => { setClosing(null); setOutcome(''); }}>Back</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button type="button" className={btnSm} disabled={busy} onClick={() => setClosing('done')}><Check className="w-3.5 h-3.5" />Held</button>
                      <button type="button" className={btnSm} disabled={busy} onClick={() => setClosing('missed')}>Did not happen</button>
                      <button type="button" className={btnSm} disabled={busy} onClick={() => setClosing('cancelled')}>Cancelled</button>
                      <button type="button" className={btnSm} onClick={() => { setNext(l.next!); setEditNext(true); }}>Change</button>
                    </div>
                  )
                )}
                {canEdit && l.next.kind !== 'meeting' && (
                  <div className="flex gap-2 mt-3">
                    <button type="button" className={btnSm} disabled={busy} onClick={() => { setNext({ text: '', due: addDays(dayKey(d.now), 2), kind: 'call' }); setEditNext(true); commit(withTouch({ ...l, next: null }, { kind: 'note', text: `Done: ${l.next!.text}` }, d.me)); }}><Check className="w-3.5 h-3.5" />Done</button>
                    <button type="button" className={btnSm} onClick={() => { setNext(l.next!); setEditNext(true); }}>Change</button>
                  </div>
                )}
              </>
            )}
          </Panel>
          <Panel icon={Hourglass} title="If it goes quiet" blurb="The desk reminds you, then the lead">
            <p className="text-xs text-slate-600">No touch for {QUIET_DAYS} days puts it at the top of {mine ? 'your' : 'its owner’s'} Today list. {QUIET_DAYS_LEAD} days, and {opener} sees it.{u.quietDays >= 1 && l.firstTouchAt ? ` Last touch ${u.quietDays} day${u.quietDays === 1 ? '' : 's'} ago.` : ''}</p>
          </Panel>
          {isOpen(l) && (l.stage === 'measured' || l.stage === 'proposal' || l.openRequest) && (
            <Panel icon={ShieldCheck} title="Ready for a proposal?" blurb="The project opens with everything collected here">
              {l.openRequest && !d.isLead
                ? <p className="text-xs text-slate-600 inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#3D52A0]" />Asked {opener} {fmtWhen(l.openRequest.at)}. It comes back on your desk when the project opens.</p>
                : <button type="button" className={`${btnPri} pp-press w-full`} disabled={!canEdit} onClick={() => onOpenProject(l)}><Send className="w-4 h-4" />{d.isLead ? 'Open the project' : `Ask ${opener} to open the project`}</button>}
            </Panel>
          )}
          {l.projectId && (
            <div className="relative rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-center gap-3">
              <DoneTick size={36} />
              <div className="flex-1"><p className="text-sm font-bold text-slate-800">Won. The project is open.</p><p className="text-xs text-slate-500">Everything collected went with it.</p></div>
              <button type="button" className={btnSm} onClick={() => d.act.openProject(l.projectId!)}>Open it</button>
            </div>
          )}
          {d.isLead && (
            <Panel icon={UserPlus} title="Owner" blurb="Who works this lead">
              <select aria-label="Owner" className={input} value={l.ownerEmail} disabled={busy}
                onChange={(e) => { const o = owners.find((x) => x.email === e.target.value) || d.me; commit({ ...l, ownerEmail: o.email, ownerName: o.name }); }}>
                {[d.me, ...owners.filter((o) => o.email !== d.me.email)].map((o) => <option key={o.email} value={o.email}>{o.name}</option>)}
              </select>
              <button type="button" className="mt-3 text-xs font-bold text-rose-700 inline-flex items-center gap-1.5" onClick={() => { if (window.confirm(`Delete the lead ${leadName(l)}? This cannot be undone.`)) onDelete(l); }}><Trash2 className="w-3.5 h-3.5" />Delete the lead</button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Notes on a lead ─────────────────────────────────────────────────────── */

/**
 * What the studio knows about a lead that is not a touch: what they care
 * about, what was promised, who not to call before noon. Pinned notes stay on
 * top; anyone who works the lead adds one, and its writer or a lead edits it.
 */
function LeadNotes({ lead: l, canEdit, busy, onChange }: { lead: Lead; canEdit: boolean; busy: boolean; onChange: (l: Lead) => void }) {
  const d = useDesk();
  const [text, setText] = useState('');
  const [pin, setPin] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const notes = sortedNotes(l.notes);
  const mayChange = (n: LeadNote) => canEdit && (d.isLead || n.by === d.me.email);
  const save = () => {
    if (!text.trim()) return;
    onChange(addNote(l, text, d.me, Date.now(), pin));
    setText('');
    setPin(false);
  };
  return (
    <Panel icon={StickyNote} title="Notes" blurb="What to remember about them: preferences, promises, who decides what. Pinned notes stay on top."
      right={notes.length ? <Chip>{notes.length}</Chip> : undefined}>
      {canEdit && (
        <div className="flex flex-col gap-2 mb-4">
          <textarea aria-label="A note on the lead" rows={3} maxLength={NOTE_MAX} className={`${input} resize-y`} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Wife decides on the kitchen; wants Italian marble; call after 7 pm"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} />
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={pin} onClick={() => setPin((x) => !x)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${pin ? 'bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/30' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
              <Pin className="w-3.5 h-3.5" />{pin ? 'Pinned' : 'Pin it'}
            </button>
            <span className="flex-1" />
            <button type="button" className={btnSm} disabled={busy || !text.trim()} onClick={save}><Check className="w-3.5 h-3.5" />Save note</button>
          </div>
        </div>
      )}
      {!notes.length ? <p className="text-xs text-slate-500">No notes yet.</p> : (
        <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
          {notes.map((n) => (
            <motion.li variants={rowV} key={n.id} className={`rounded-xl border px-3 py-2.5 ${n.pinned ? 'border-[#3D52A0]/30 bg-[#3D52A0]/5' : 'border-slate-200'}`}>
              {editing === n.id ? (
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); setEditing(null); onChange(editNote(l, n.id, { text: editText }, Date.now())); }}>
                  <textarea autoFocus aria-label="Edit the note" rows={3} maxLength={NOTE_MAX} className={`${input} resize-y`} value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div className="flex gap-2 justify-end">
                    <button type="button" className={btnSm} onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className={btnSm} disabled={busy || !editText.trim()}><Check className="w-3.5 h-3.5" />Save</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{n.pinned && <Pin className="inline w-3.5 h-3.5 text-[#3D52A0] mr-1 -mt-0.5" />}{n.text}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="text-[11px] text-slate-500">{n.byName} · {fmtWhen(n.at)}{n.editedAt ? ' · edited' : ''}</span>
                    <span className="flex-1" />
                    {mayChange(n) && (
                      <span className="flex items-center gap-1">
                        <button type="button" disabled={busy} className="p-1 rounded-md text-slate-400 hover:text-[#3D52A0] hover:bg-slate-100" title={n.pinned ? 'Unpin' : 'Pin to the top'} aria-label={n.pinned ? 'Unpin' : 'Pin to the top'}
                          onClick={() => onChange(editNote(l, n.id, { pinned: !n.pinned }, Date.now()))}>{n.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
                        <button type="button" disabled={busy} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Edit" aria-label="Edit the note"
                          onClick={() => { setEditing(n.id); setEditText(n.text); }}><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" disabled={busy} className="p-1 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50" title="Delete" aria-label="Delete the note"
                          onClick={() => { if (window.confirm('Delete this note?')) onChange(removeNote(l, n.id)); }}><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Panel>
  );
}

/* ── Every meeting with a lead, on Meetings & visits ──────────────────────── */

const ROW_TONE: Record<LeadMeetingRowStatus, ChipTone> = {
  upcoming: 'brand', needs_time: 'amber', to_close: 'rose', done: 'emerald', missed: 'amber', cancelled: 'slate',
};

/**
 * The meetings with people who are not clients yet. A lead has no project, so
 * none of these is on a project's timeline: this table is where they are
 * tracked, booked and over, each marked as a lead's (lib/leads leadMeetingRows).
 */
export function LeadMeetingsTable({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const d = useDesk();
  const [show, setShow] = useState<'open' | 'over' | 'all'>('all');
  const [whose, setWhose] = useState<'mine' | 'everyone'>(d.isLead ? 'everyone' : 'mine');
  const all = useMemo(() => leadMeetingRows(d.leads, d.now), [d.leads, d.now]);
  const isOpenRow = (r: LeadMeetingRow) => r.status === 'upcoming' || r.status === 'needs_time' || r.status === 'to_close';
  const mineOnly = (r: LeadMeetingRow) => whose === 'everyone' || d.leads.find((l) => l.id === r.leadId)?.ownerEmail === d.me.email;
  const rows = all.filter((r) => mineOnly(r) && (show === 'all' || (show === 'open') === isOpenRow(r)));
  const openCount = all.filter((r) => mineOnly(r) && isOpenRow(r)).length;
  return (
    <Panel icon={UserPlus} title="Meetings with leads" tour="lead-meetings"
      blurb="People who are not clients yet: every meeting booked with a lead, and the ones that are over. They are not on any project's timeline, so they are tracked here. Book, move or close one out on the lead."
      right={openCount > 0 ? <Chip tone="brand">{openCount} booked</Chip> : undefined}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Glide id="lead-meet-show" label="Show" value={show} onChange={setShow} options={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Booked' }, { id: 'over', label: 'Over' }]} />
        {d.isLead && <Glide id="lead-meet-whose" label="Whose" value={whose} onChange={setWhose} options={[{ id: 'mine', label: 'Mine' }, { id: 'everyone', label: 'Everyone' }]} />}
        <span className="flex-1" />
        <span className="text-[11px] text-slate-500">Last 90 days, and everything still to come.</span>
      </div>
      {!rows.length ? <Empty icon={CalendarCheck} text={show === 'over' ? 'No meetings with leads in the last 90 days.' : 'No meetings booked with leads. Book one from a lead with "Book a meeting".'} /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50"><tr className={`${EYEBROW} text-left`}>
              <th className="py-2 px-3">Lead</th><th className="px-3">Meeting</th><th className="px-3">When</th><th className="px-3">How</th><th className="px-3">Owner</th><th className="px-3">Status</th><th className="px-3" aria-label="Actions" />
            </tr></thead>
            <motion.tbody variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100">
              {rows.map((r) => (
                <motion.tr variants={rowV} key={r.key} className="align-top hover:bg-slate-50">
                  <td className="py-2.5 px-3">
                    <b className="font-semibold text-slate-800">{r.leadName}</b>
                    <span className="block text-[11px] text-slate-500">{r.home || 'Home not filled in'}</span>
                    <span className="mt-1 inline-flex">{r.projectId ? <Chip tone="emerald">Now a project</Chip> : r.stage === 'lost' ? <Chip>Lead · lost</Chip> : <Chip tone="brand">Lead · no project yet</Chip>}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-slate-800">{r.purpose || 'Meeting'}</span>
                    {r.outcome && <span className="block text-[11px] text-slate-500">{r.outcome}</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{fmtDay(r.date)}{r.time ? `, ${clock12(r.time)}` : ''}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">{r.mode ? VISIT_MODES.find((m) => m.id === r.mode)?.label : '—'}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">{r.ownerName}</td>
                  <td className="py-2.5 px-3"><Chip tone={ROW_TONE[r.status]}>{LEAD_MEETING_ROW_LABEL[r.status]}</Chip></td>
                  <td className="py-2.5 px-3">
                    <span className="flex justify-end gap-2">
                      {isOpenRow(r) && r.meetUrl && <a href={r.meetUrl} target="_blank" rel="noopener noreferrer" className={btnSm}>Join</a>}
                      <button type="button" className={btnSm} onClick={() => onOpenLead(r.leadId)}>Open lead</button>
                    </span>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── L4: from lead to project ────────────────────────────────────────────── */

export function OpenProjectSheet({ lead: l, opener, onClose, onAsk, onOpen }: {
  lead: Lead;
  opener: string;
  onClose: () => void;
  onAsk: () => Promise<void>;
  onOpen: () => Promise<void>;
}) {
  const d = useDesk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await f(); } catch { setError('That did not go through. Try again.'); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Ready for a proposal?">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 pt-5 pb-4">
          <p className={BRAND_EYEBROW}>{leadName(l)} · {l.home.where.split(/[·,]/)[0] || 'lead'} · {LEAD_STAGES.find((s) => s.id === l.stage)?.label.toLowerCase()}</p>
          <h3 className="text-lg font-bold text-slate-800">Ready for a proposal?</h3>
          <p className="text-xs text-slate-500">This opens the project at its first stage, with everything you collected.</p>
        </div>
        <motion.div variants={listV} initial="hidden" animate="show" className="px-6 pb-5 flex flex-col gap-3 overflow-y-auto">
          {conversionLines(l).map(([k, v]) => (
            <motion.div variants={rowV} key={k} className="flex gap-3 text-sm"><span className="w-24 text-xs text-slate-500 pt-0.5 shrink-0">{k}</span><span className="flex-1 text-slate-800">{v}</span><Check className="w-4 h-4 text-emerald-600 shrink-0" /></motion.div>
          ))}
          <div className="rounded-xl bg-[#3D52A0]/5 border border-[#3D52A0]/20 px-3 py-2.5 text-xs text-slate-700 flex gap-2">
            <Lock className="w-4 h-4 text-[#3D52A0] shrink-0" />
            <span>{d.isLead
              ? <><b>You open the project.</b> It is tagged Actual, starts as a lead, and goes on {l.ownerName || 'the owner'}’s desk, assigned to them. The budget they said stays with the lead.</>
              : <><b>{opener} opens the project.</b> Projects carry fees and money, so an Owner, Admin or Ops Director says yes. You get it back on your desk, assigned to you, the moment they do.</>}
            </span>
          </div>
          {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </motion.div>
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex justify-end gap-3">
          <button type="button" className={btnSec} onClick={onClose}>Not yet</button>
          {d.isLead
            ? <button type="button" className={`${btnPri} pp-press`} disabled={busy} onClick={() => go(onOpen)}><Send className="w-4 h-4" />{busy ? 'Opening…' : 'Open the project'}</button>
            : <button type="button" className={`${btnPri} pp-press`} disabled={busy || !!l.openRequest} onClick={() => go(onAsk)}><Send className="w-4 h-4" />{l.openRequest ? 'Asked' : `Ask ${opener} to open the project`}</button>}
        </div>
      </div>
    </div>
  );
}
