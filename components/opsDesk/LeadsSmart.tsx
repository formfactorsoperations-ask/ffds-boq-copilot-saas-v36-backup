import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Flame, Snowflake, Thermometer, ThumbsDown, Check, X, ChevronLeft, ChevronRight, Phone, MessageCircle, CalendarCheck, Lock, Lightbulb,
  RotateCcw, Copy, Trophy, Plus, Trash2, BarChart3, Send, Ruler, FileText, Hourglass,
} from '@/lib/lucide-shim';
import { Glide, IconTile, Tilt, listV, rowV } from '../people/PeopleBits';
import { CountUp } from '../ui/HudBits';
import { addDays, dayKey } from '../../lib/opsDesk';
import {
  BOARD_STAGES, LEAD_SOURCES, LEAD_STAGES, LOST_REASONS, SCOPES, blankPerson, homeLine, isOpen, leadName, mainPerson, sourceLabel,
  type Lead, type LeadPerson, type LeadSource,
} from '../../lib/leads';
import {
  HEAT_LABEL, TEMPLATES, firstNameOf, calendarItems, stageAge, leadHeat, leadInsights, monthGrid, moveCalItem, nextBestAction, shiftMonth, templateText,
  type CalItem, type Suggestion, type TemplateId,
} from '../../lib/leadSmart';
import { saveLead, withTouch } from '../../services/leadsService';
import { clock12 } from '../../lib/peopleDesk';
import { btnPri, btnSec, btnSm, input, Label, Sheet } from './OpsDeskPanels';
import { useDesk, Panel, Chip, Empty, EYEBROW, BRAND_EYEBROW, fmtDay, dialable, waLink } from './DeskBits';
import '../projectHeader/projectHeader.css';

/*
  THE SMART HALF OF LEADS (lib/leadSmart.ts): how warm each lead is, closing
  one as lost with the reason in the studio's words and a day to try again,
  editing a lead's name and details, a calendar of every next step, where
  leads come from and where they are lost, and on each lead the one thing
  most worth doing next with a message ready to send.
*/

/* ── Hot, warm, cold ─────────────────────────────────────────────────────── */

const HEAT_TONE = { hot: 'rose', warm: 'amber', cold: 'slate' } as const;
const HEAT_ICON = { hot: Flame, warm: Thermometer, cold: Snowflake } as const;

export const HeatChip: React.FC<{ lead: Lead; withScore?: boolean }> = ({ lead, withScore }) => {
  const d = useDesk();
  const h = leadHeat(lead, d.now);
  if (!h) return null;
  const Icon = HEAT_ICON[h.heat];
  return (
    <span title={`${HEAT_LABEL[h.heat]} (${h.score} of 100): ${h.reasons.join(', ') || 'not much to go on yet'}`}>
      <Chip tone={HEAT_TONE[h.heat]}><Icon className="w-3 h-3" />{HEAT_LABEL[h.heat]}{withScore ? ` · ${h.score}` : ''}</Chip>
    </span>
  );
};

/* ── Lost: why, in the studio's words, and a day to try again ────────────── */

export function LostSheet({ lead: l, onClose, onSave }: { lead: Lead; onClose: () => void; onSave: (reason: string, note: string, revisitOn: string | null) => Promise<void> }) {
  const d = useDesk();
  const [reason, setReason] = useState<string>(l.lostReason || '');
  const [note, setNote] = useState(l.lostNote || '');
  const [revisit, setRevisit] = useState<'no' | '1m' | '3m' | '6m' | 'pick'>(l.revisitOn ? 'pick' : 'no');
  const [day, setDay] = useState(l.revisitOn || addDays(dayKey(d.now), 90));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisitOn = revisit === 'no' ? null : revisit === 'pick' ? day : addDays(dayKey(d.now), revisit === '1m' ? 30 : revisit === '3m' ? 90 : 180);
  const needsNote = reason === 'Other' && !note.trim();
  const save = async () => {
    setBusy(true);
    setError(null);
    try { await onSave(reason, note, revisitOn); } catch { setError('That was not saved. Only its owner, or a lead, can change it.'); setBusy(false); }
  };
  return (
    <Sheet eyebrow={`Lead · ${leadName(l)}`} title="Why was it lost?" sub="The reason is counted in Reports and on the Leads board; the note is for whoever picks it up again." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={`${btnPri} pp-press`} disabled={busy || !reason || needsNote} onClick={save}><ThumbsDown className="w-4 h-4" />{busy ? 'Saving…' : 'Mark as lost'}</button>
      </>}>
      <div>
        <Label>The reason</Label>
        <div className="flex flex-wrap gap-1.5">
          {LOST_REASONS.map((r) => (
            <motion.button whileTap={{ scale: 0.94 }} key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${reason === r ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{r}</motion.button>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="lost-note">What happened {reason === 'Other' ? '' : <span className="normal-case font-semibold text-slate-400">(optional)</span>}</Label>
        <textarea id="lost-note" rows={3} maxLength={500} className={`${input} resize-y`} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={reason === 'Budget' ? 'Wanted the full home for ₹12 L; our estimate was ₹22 L' : reason === 'Postponed' ? 'Possession moved to mid-2027' : 'In a line, what happened'} />
        {needsNote && <p className="text-[11px] text-amber-700 mt-1">Say what happened when the reason is Other, so it can be counted properly later.</p>}
      </div>
      <div>
        <Label>Try again?</Label>
        <Glide id="lost-revisit" label="Try again" value={revisit} onChange={setRevisit}
          options={[{ id: 'no', label: 'No' }, { id: '1m', label: 'In a month' }, { id: '3m', label: 'In 3 months' }, { id: '6m', label: 'In 6 months' }, { id: 'pick', label: 'Pick a day' }]} />
        {revisit === 'pick' && <input type="date" aria-label="Try again on" className={`${input} mt-2 !w-auto`} min={addDays(dayKey(d.now), 1)} value={day} onChange={(e) => setDay(e.target.value)} />}
        {revisitOn && <p className="text-[11px] text-slate-500 mt-1">On {fmtDay(revisitOn)} it comes back on {l.ownerName || 'the owner'}’s Today list with a message ready.</p>}
      </div>
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
    </Sheet>
  );
}

/* ── Edit a lead: its name, the people, the home, where it came from ──────── */

export function EditLeadSheet({ lead: l, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (l: Lead) => void }) {
  const d = useDesk();
  const [label, setLabel] = useState(l.label || '');
  const [people, setPeople] = useState<LeadPerson[]>(l.people.map((p) => ({ ...p })));
  const [home, setHome] = useState({ ...l.home, scope: [...l.home.scope] });
  const [source, setSource] = useState<LeadSource>(l.source);
  const [sourceNote, setSourceNote] = useState(l.sourceNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPerson = (i: number, patch: Partial<LeadPerson>) => setPeople(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const worked = leadName({ people, label: '' });
  const mainOk = !!people[0]?.name.trim() && (!!people[0]?.phone.trim() || !!people[0]?.email.trim());
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next: Lead = { ...l, label: label.trim() && label.trim() !== worked ? label.trim().slice(0, 80) : null, people: people.filter((p, i) => i === 0 || p.name.trim() || p.phone.trim() || p.email.trim()).map((p, i) => ({ ...p, main: i === 0 })), home, source, sourceNote };
      onSaved(await saveLead(withTouch(next, { kind: 'note', text: 'Details edited' }, d.me), d.me.email));
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'Only its owner, or a lead, can change it. If you renamed it, the new database rules may not be deployed yet.' : 'That was not saved. Try again.');
      setBusy(false);
    }
  };
  return (
    <Sheet eyebrow="Edit the lead" title={leadName(l)} sub="Its name, the people, the home and where it came from. The touches and notes stay as they are." onClose={onClose}
      footer={<>
        <button type="button" className={btnSec} onClick={onClose}>Cancel</button>
        <button type="button" className={`${btnPri} pp-press`} disabled={busy || !mainOk} onClick={save}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save changes'}</button>
      </>}>
      <div>
        <Label htmlFor="lead-label">What we call this lead</Label>
        <input id="lead-label" maxLength={80} className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={worked} />
        <p className="text-[11px] text-slate-500 mt-1">Leave it empty to use “{worked}”, worked out from the people.</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className={EYEBROW}>The people</p>
        {people.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input aria-label="Name" className={`${input} !py-1.5 font-bold`} value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} placeholder="Name" />
            <span className="flex items-center gap-2">
              <input aria-label="Who they are" className={`${input} !py-1.5 text-xs`} value={p.role} onChange={(e) => setPerson(i, { role: e.target.value })} placeholder={i === 0 ? 'Main contact' : 'Wife, father, their architect…'} />
              {i > 0 && <button type="button" aria-label="Remove this person" className="p-1 text-slate-400 hover:text-rose-600" onClick={() => setPeople(people.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>}
            </span>
            <input aria-label="Phone" type="tel" className={`${input} !py-1.5`} value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} placeholder="Phone" />
            <input aria-label="Email" type="email" className={`${input} !py-1.5`} value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} placeholder="Email" />
          </div>
        ))}
        {people.length < 8 && <button type="button" className="self-start text-xs font-bold text-[#3D52A0] inline-flex items-center gap-1" onClick={() => setPeople([...people, blankPerson(false)])}><Plus className="w-3.5 h-3.5" />Add a person</button>}
        {!mainOk && <p className="text-[11px] text-amber-700">The main contact needs a name and a phone or email.</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2"><span className={`${EYEBROW} block mb-1.5`}>Where</span><input className={input} value={home.where} onChange={(e) => setHome({ ...home, where: e.target.value })} /></label>
        <label><span className={`${EYEBROW} block mb-1.5`}>Type</span><input className={input} value={home.type} onChange={(e) => setHome({ ...home, type: e.target.value })} placeholder="3 BHK" /></label>
        <label><span className={`${EYEBROW} block mb-1.5`}>Carpet area (sq ft)</span><input className={input} inputMode="numeric" value={home.area ?? ''} onChange={(e) => setHome({ ...home, area: Number(e.target.value.replace(/\D/g, '')) || null })} /></label>
        <label><span className={`${EYEBROW} block mb-1.5`}>Possession / start</span><input className={input} value={home.possession} onChange={(e) => setHome({ ...home, possession: e.target.value })} placeholder="Jan 2027" /></label>
        <label><span className={`${EYEBROW} block mb-1.5`}>Budget they said</span><input className={input} value={home.budget} onChange={(e) => setHome({ ...home, budget: e.target.value })} placeholder="₹25–30 L" /></label>
      </div>
      <div>
        <Label>What they want done</Label>
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((x) => {
            const on = home.scope.includes(x);
            return <button key={x} type="button" aria-pressed={on} onClick={() => setHome({ ...home, scope: on ? home.scope.filter((s) => s !== x) : [...home.scope, x] })}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{x}</button>;
          })}
        </div>
      </div>
      <div>
        <Label>How they found us</Label>
        <Glide id="edit-source" label="How they found us" value={source} onChange={setSource} options={LEAD_SOURCES} />
        <input aria-label="Who" className={`${input} mt-2 !py-1.5 text-xs`} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="Referred by, which architect, or where from" />
      </div>
      {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
    </Sheet>
  );
}

/* ── Won and lost, under the board ───────────────────────────────────────── */

/* ── Where every lead stands: the strip over the board ──────────────────── */

const STRIP_ICON: Record<string, React.ComponentType<any>> = { new: Plus, talking: Phone, meeting: CalendarCheck, measured: Ruler, proposal: FileText, won: Trophy, lost: ThumbsDown };

/**
 * The pipeline in one row, from New to Won, with Lost apart: how many are in
 * each stage and how many are stuck. A segment scrolls its column into view,
 * and takes a dragged card like the column does.
 */
export function PipelineStrip({ leads, over, dragging, onPick }: { leads: Lead[]; over: string | null; dragging: boolean; onPick: (stage: string) => void }) {
  const d = useDesk();
  const since = d.now - 60 * 86400000;
  const segs = [...BOARD_STAGES, 'won' as const].map((st, i) => {
    const here = st === 'won'
      ? leads.filter((l) => (l.stage === 'won' && (l.closedAt ?? l.updatedAt) >= since) || (isOpen(l) && l.openRequest && !l.projectId)).length
      : leads.filter((l) => l.stage === st && !(l.openRequest && !l.projectId)).length;
    const stuck = st === 'won' ? 0 : leads.filter((l) => l.stage === st && stageAge(l, d.now).stuck).length;
    return { st, i, here, stuck, label: st === 'won' ? 'Won' : LEAD_STAGES.find((s) => s.id === st)?.label || st };
  });
  const lost = leads.filter((l) => l.stage === 'lost' && (l.closedAt ?? l.updatedAt) >= since).length;
  const last = segs.length - 1;
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0 flex items-stretch">
        {segs.map(({ st, i, here, stuck, label }) => {
          const Icon = STRIP_ICON[st];
          const won = st === 'won';
          const hot = dragging && over === st;
          const clip = i === 0 ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)'
            : i === last ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)'
            : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)';
          return (
            <motion.button key={st} type="button" data-stage={st} onClick={() => onPick(st)} title={`${label}: ${here}${stuck ? `, ${stuck} stuck` : ''}`}
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0, scale: hot ? 1.04 : 1 }} transition={{ delay: dragging ? 0 : i * 0.05 }} whileHover={{ y: -2 }}
              style={{ clipPath: clip, marginLeft: i === 0 ? 0 : -6, zIndex: hot ? 2 : 1 }}
              className={`relative flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2.5 ${i === 0 ? 'pl-3 pr-4' : 'pl-5 pr-4'} transition-colors ${
                hot ? (won ? 'bg-emerald-500 text-white' : 'bg-[#3D52A0] text-white')
                  : won ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0]/20'}`}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline text-[11px] font-bold truncate">{label}</span>
              <span className="text-sm font-black tabular-nums"><CountUp value={here} /></span>
              {stuck > 0 && !hot && <span title={`${stuck} stuck`} className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
            </motion.button>
          );
        })}
      </div>
      <motion.button type="button" data-stage="lost" onClick={() => onPick('lost')} title={`Lost in the last 60 days: ${lost}`}
        initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0, scale: dragging && over === 'lost' ? 1.04 : 1 }} whileHover={{ y: -2 }}
        className={`shrink-0 rounded-xl px-3 flex items-center gap-1.5 transition-colors ${dragging && over === 'lost' ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}>
        <ThumbsDown className="w-3.5 h-3.5" /><span className="hidden lg:inline text-[11px] font-bold">Lost</span><span className="text-sm font-black tabular-nums"><CountUp value={lost} /></span>
      </motion.button>
    </div>
  );
}

/* ── Won: the last column ────────────────────────────────────────────────── */

/**
 * A lead is won when its project opens. The column holds the leads whose
 * client said yes and are waiting for a lead to open the project, then those
 * won in the last 60 days. Dropping a card here is "Mark as won".
 */
export function WonColumn({ leads, over, dragging, opener, onOpen, onConvert }: {
  leads: Lead[]; over: string | null; dragging: boolean; opener: string; onOpen: (id: string) => void; onConvert: (l: Lead) => void;
}) {
  const d = useDesk();
  const since = d.now - 60 * 86400000;
  const waiting = leads.filter((l) => isOpen(l) && l.openRequest && !l.projectId).sort((a, b) => a.openRequest!.at - b.openRequest!.at);
  const won = leads.filter((l) => l.stage === 'won' && (l.closedAt ?? l.updatedAt) >= since).sort((a, b) => (b.closedAt ?? b.updatedAt) - (a.closedAt ?? a.updatedAt));
  const older = leads.filter((l) => l.stage === 'won').length - won.length;
  const hot = dragging && over === 'won';
  return (
    <motion.div id="lead-col-won" data-stage="won" initial={{ opacity: 0, y: 20, rotateY: -12 }} animate={{ opacity: 1, y: 0, rotateY: 0, scale: hot ? 1.015 : 1 }}
      transition={{ delay: dragging ? 0 : 0.3, duration: dragging ? 0.2 : 0.45 }} style={{ transformPerspective: 1000 }}
      className={`rounded-2xl border min-w-0 flex flex-col overflow-hidden transition-colors ${hot ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200' : 'bg-emerald-50/50 border-emerald-200'}`}>
      <span className="h-1 bg-emerald-500" aria-hidden />
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800 truncate inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-emerald-600" />Won</p><p className="text-[10px] text-slate-500 truncate">When the project opens</p></div>
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-700 tabular-nums border border-emerald-200">{waiting.length + won.length}</span>
      </div>
      <div className="px-2 pb-2 flex flex-col gap-2 min-h-[96px]">
        {hot && <p className="rounded-xl border-2 border-dashed border-emerald-400 text-xs font-bold text-emerald-700 text-center py-3">{d.isLead ? 'Drop to open the project' : `Drop to ask ${opener} to open it`}</p>}
        {waiting.length > 0 && <p className={`${EYEBROW} px-1 pt-1`}>Said yes · {d.isLead ? 'open the project' : `waiting for ${opener}`}</p>}
        <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
          {waiting.map((l) => (
            <motion.div variants={rowV} key={l.id}>
              <Tilt max={6} className="rounded-xl">
                <div className="rounded-xl bg-white border border-amber-200 shadow-sm p-2.5">
                  <button type="button" onClick={() => onOpen(l.id)} className="w-full text-left">
                    <span className="block text-sm font-bold text-slate-800 truncate">{leadName(l)}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{homeLine(l.home) || sourceLabel(l.source)}</span>
                  </button>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-700"><Hourglass className="w-3 h-3" />Asked {fmtDay(dayKey(l.openRequest!.at))}</span>
                  {d.isLead && <button type="button" onClick={() => onConvert(l)} className={`${btnPri} !py-1 !text-xs w-full justify-center mt-2 pp-press`}><Trophy className="w-3.5 h-3.5" />Open project</button>}
                </div>
              </Tilt>
            </motion.div>
          ))}
          {won.map((l) => (
            <motion.div variants={rowV} key={l.id}>
              <Tilt max={6} className="rounded-xl">
                <button type="button" onClick={() => onOpen(l.id)} className="w-full text-left rounded-xl bg-white border border-emerald-200 shadow-sm p-2.5 hover:border-emerald-400 transition-colors">
                  <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="text-sm font-bold text-slate-800 truncate">{leadName(l)}</span></span>
                  <span className="block text-[11px] text-slate-500 truncate mt-0.5">{homeLine(l.home) || sourceLabel(l.source)}</span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold"><Check className="w-3 h-3" />Project open · {fmtDay(dayKey(l.closedAt ?? l.updatedAt))}</span>
                </button>
              </Tilt>
            </motion.div>
          ))}
        </motion.div>
        {!waiting.length && !won.length && !hot && (
          <div className="flex-1 rounded-xl border-2 border-dashed border-emerald-200 grid place-items-center text-center px-3 py-4">
            <p className="text-[11px] text-slate-500"><Trophy className="w-4 h-4 text-emerald-400 mx-auto mb-1" />Drag a lead here when the client says yes.</p>
          </div>
        )}
        {older > 0 && <p className="text-[11px] text-slate-500 px-1">{older} won earlier, in the list</p>}
      </div>
    </motion.div>
  );
}

/* ── Lost: the lane under the board ──────────────────────────────────────── */

/** Lost in the last 60 days, with the reason, the note and when to try again. A card dropped here asks why. */
export function LostLane({ leads, over, dragging, onOpen }: { leads: Lead[]; over: string | null; dragging: boolean; onOpen: (id: string) => void }) {
  const d = useDesk();
  const since = d.now - 60 * 86400000;
  const list = leads.filter((l) => l.stage === 'lost' && (l.closedAt ?? l.updatedAt) >= since).sort((a, b) => (b.closedAt ?? b.updatedAt) - (a.closedAt ?? a.updatedAt));
  const older = leads.filter((l) => l.stage === 'lost').length - list.length;
  const hot = dragging && over === 'lost';
  return (
    <motion.div id="lead-col-lost" data-stage="lost" animate={{ scale: hot ? 1.01 : 1 }}
      className={`rounded-2xl border p-3 min-w-0 transition-colors ${hot ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-200' : dragging ? 'bg-white border-dashed border-rose-300' : 'bg-white border-slate-200'}`}>
      <p className="flex items-center gap-2 pb-2 text-sm font-bold text-slate-800">
        <IconTile icon={ThumbsDown} tone="bad" size="sm" />Lost
        <span className="text-[11px] font-semibold text-slate-500">last 60 days</span>
        <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 tabular-nums">{list.length}</span>
      </p>
      {dragging && <p className="text-xs font-bold text-center py-2 rounded-xl border-2 border-dashed mb-2 text-rose-700 border-rose-300">Drop here to mark it lost</p>}
      {!list.length ? <p className="text-xs text-slate-500">None lost lately.</p> : (
        <motion.ul variants={listV} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
          {list.slice(0, 8).map((l) => (
            <motion.li variants={rowV} key={l.id} className="border-t border-slate-100">
              <button type="button" onClick={() => onOpen(l.id)} className="w-full text-left py-2 flex items-start gap-2 hover:bg-slate-50 rounded-lg px-1">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{leadName(l)}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{l.lostReason || 'No reason given'}{l.lostNote ? ` · ${l.lostNote}` : ''}</span>
                </span>
                <span className="text-[11px] text-slate-500 shrink-0">{fmtDay(dayKey(l.closedAt ?? l.updatedAt))}</span>
                {l.revisitOn && <span title={`Try again ${l.revisitOn}`}><Chip tone="brand"><RotateCcw className="w-3 h-3" />{fmtDay(l.revisitOn)}</Chip></span>}
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {(list.length > 8 || older > 0) && <p className="text-[11px] text-slate-500 mt-1">{list.length > 8 ? `${list.length - 8} more` : ''}{list.length > 8 && older > 0 ? ', ' : ''}{older > 0 ? `${older} older` : ''} in the list view.</p>}
    </motion.div>
  );
}

/* ── The calendar ────────────────────────────────────────────────────────── */

const KIND_ICON = { call: Phone, whatsapp: MessageCircle, meeting: CalendarCheck, revisit: RotateCcw } as const;

/**
 * Every lead's next step on its day, and the days to try lost ones again. Drag
 * one to another day to move it (with a mouse or trackpad); a meeting on
 * Google Calendar is moved on the lead, so the calendar event moves with it.
 */
export function LeadCalendar({ leads, onOpen, onMoved }: { leads: Lead[]; onOpen: (id: string) => void; onMoved: (l: Lead) => void }) {
  const d = useDesk();
  const today = dayKey(d.now);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string>(today);
  const [over, setOver] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const items = useMemo(() => calendarItems(leads, d.now), [leads, d.now]);
  const days = monthGrid(month);
  const byDay = (k: string) => items.filter((i) => i.date === k);
  const overdue = items.filter((i) => i.overdue);
  const dayAt = (x: number, y: number) => (document.elementsFromPoint(x, y).find((e) => (e as HTMLElement).dataset?.day) as HTMLElement | undefined)?.dataset.day || null;
  const canMove = (i: CalItem) => {
    const l = leads.find((x) => x.id === i.leadId);
    return !!l && i.movable && d.canWrite && (d.isLead || l.ownerEmail === d.me.email);
  };
  const move = async (i: CalItem, to: string | null) => {
    setOver(null);
    if (!to || to === i.date) return;
    const l = leads.find((x) => x.id === i.leadId);
    if (!l || !canMove(i)) return;
    const next = withTouch(moveCalItem(l, i, to), { kind: 'note', text: `${i.kind === 'revisit' ? 'Try again' : i.title}: moved to ${to}` }, d.me);
    onMoved(next);
    try {
      onMoved(await saveLead(next, d.me.email));
      setNote(`${i.leadName}: moved to ${fmtDay(to)}.`);
    } catch {
      onMoved(l);
      setNote(`${i.leadName} could not be moved.`);
    }
    window.setTimeout(() => setNote(null), 3000);
  };
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const pickedItems = byDay(picked);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button type="button" aria-label="Previous month" className={btnSm} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="w-4 h-4" /></button>
          <AnimatePresence mode="wait">
            <motion.h3 key={month} initial={{ opacity: 0, rotateX: -40 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0, rotateX: 40 }} transition={{ duration: 0.25 }}
              className="font-bold text-slate-800 min-w-[150px] text-center">{title}</motion.h3>
          </AnimatePresence>
          <button type="button" aria-label="Next month" className={btnSm} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="w-4 h-4" /></button>
          <button type="button" className={btnSm} onClick={() => { setMonth(today.slice(0, 7)); setPicked(today); }}>Today</button>
          <span className="flex-1" />
          {overdue.length > 0 && <Chip tone="rose">{overdue.length} overdue</Chip>}
          <span className="hidden md:inline text-[11px] text-slate-500">Drag a step to another day to move it.</span>
        </div>
        <AnimatePresence>{note && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{note}</motion.p>}</AnimatePresence>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <p key={w} className={`${EYEBROW} text-center`}>{w}</p>)}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={month} initial={{ opacity: 0, rotateY: -12 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: 12 }} transition={{ duration: 0.35 }}
            style={{ transformPerspective: 1400 }} className="grid grid-cols-7 gap-1">
            {days.map((k, i) => {
              const list = byDay(k);
              const inMonth = k.startsWith(month);
              const isToday = k === today;
              return (
                <motion.div key={k} data-day={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 30) * 0.008 }}
                  onClick={() => setPicked(k)}
                  className={`relative min-h-[64px] md:min-h-[96px] rounded-xl border p-1 cursor-pointer transition-colors ${over === k ? 'bg-[#3D52A0]/10 border-[#3D52A0]/40 ring-2 ring-[#3D52A0]/20' : picked === k ? 'border-[#3D52A0]/40 bg-[#3D52A0]/5' : 'border-slate-200 hover:bg-slate-50'} ${inMonth ? '' : 'opacity-45'} ${isToday ? 'pp-today' : ''}`}>
                  <p className={`text-[11px] font-black tabular-nums px-1 ${isToday ? 'text-[#3D52A0]' : 'text-slate-600'}`}>{Number(k.slice(8))}</p>
                  <div className="hidden md:flex flex-col gap-0.5">
                    {list.slice(0, 3).map((it) => <CalChip key={it.id} item={it} draggable={canMove(it)} onOpen={() => onOpen(it.leadId)} onOver={(x, y) => setOver(dayAt(x, y))} onDrop={(x, y) => move(it, dayAt(x, y))} />)}
                    {list.length > 3 && <p className="text-[10px] font-bold text-slate-500 px-1">+{list.length - 3} more</p>}
                  </div>
                  {list.length > 0 && <p className="md:hidden flex flex-wrap gap-0.5 px-1">{list.slice(0, 4).map((it) => <span key={it.id} className={`w-1.5 h-1.5 rounded-full ${it.overdue ? 'bg-rose-500' : it.kind === 'revisit' ? 'bg-amber-500' : 'bg-[#3D52A0]'}`} />)}</p>}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
      <Panel icon={CalendarCheck} title={picked === today ? 'Today' : new Date(`${picked}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        blurb={pickedItems.length ? `${pickedItems.length} on this day` : 'Nothing on this day.'}>
        {!pickedItems.length ? <Empty icon={CalendarCheck} text="Pick a day with dots to see what is on it." /> : (
          <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col divide-y divide-slate-100">
            {pickedItems.map((it) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <motion.li variants={rowV} key={it.id}>
                  <button type="button" onClick={() => onOpen(it.leadId)} className="group w-full text-left flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-1">
                    <IconTile icon={Icon} size="sm" tone={it.overdue ? 'bad' : it.kind === 'revisit' ? 'warn' : 'brand'} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{it.kind === 'revisit' ? `Try again: ${it.leadName}` : `${it.title}: ${it.leadName}`}</span>
                      <span className="block text-[11px] text-slate-500">{it.time ? clock12(it.time) : 'Any time'}{it.overdue ? ' · overdue' : ''}{!it.movable ? ' · on Google Calendar' : ''}</span>
                    </span>
                    {!it.movable && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </Panel>
    </div>
  );
}

const CalChip: React.FC<{ item: CalItem; draggable: boolean; onOpen: () => void; onOver: (x: number, y: number) => void; onDrop: (x: number, y: number) => void }> = ({ item: it, draggable, onOpen, onOver, onDrop }) => {
  const dragged = useRef(false);
  const Icon = KIND_ICON[it.kind];
  return (
    <motion.button type="button" title={`${it.leadName}: ${it.kind === 'revisit' ? 'try again' : it.title}${it.time ? `, ${clock12(it.time)}` : ''}${!it.movable ? ' (move it on the lead, so Google Calendar moves too)' : ''}`}
      drag={draggable} dragSnapToOrigin dragMomentum={false} style={{ position: 'relative' }}
      whileDrag={{ scale: 1.08, rotate: -2, zIndex: 60, boxShadow: '0 16px 30px -14px rgba(61, 82, 160, 0.55)' }}
      onDragStart={() => { dragged.current = true; }}
      onDrag={(_, info) => onOver(info.point.x - window.scrollX, info.point.y - window.scrollY)}
      onDragEnd={(_, info) => { onDrop(info.point.x - window.scrollX, info.point.y - window.scrollY); window.setTimeout(() => { dragged.current = false; }, 0); }}
      onClick={(e) => { e.stopPropagation(); if (!dragged.current) onOpen(); }}
      className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold truncate text-left ${draggable ? 'cursor-grab' : ''} ${it.overdue ? 'bg-rose-100 text-rose-700' : it.kind === 'revisit' ? 'bg-amber-100 text-amber-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>
      <Icon className="w-3 h-3 shrink-0" /><span className="truncate">{it.time ? `${clock12(it.time).replace(':00', '')} ` : ''}{it.leadName}</span>
    </motion.button>
  );
};

/* ── Where leads come from, and where they are lost ──────────────────────── */

export function LeadInsights({ leads }: { leads: Lead[] }) {
  const d = useDesk();
  const [span, setSpan] = useState<'90' | '365' | 'all'>('90');
  const since = span === 'all' ? 0 : d.now - Number(span) * 86400000;
  const i = useMemo(() => leadInsights(leads, since), [leads, since]);
  const top = Math.max(1, ...i.reached.map((r) => r.count));
  const maxReason = Math.max(1, ...i.reasons.map((r) => r.count));
  return (
    <Panel icon={BarChart3} title="How leads are doing" blurb="How far leads get, where they come from and why they are lost. Counted from the leads themselves."
      right={<Glide id="ins-span" label="Over" value={span} onChange={setSpan} options={[{ id: '90', label: '90 days' }, { id: '365', label: 'A year' }, { id: 'all', label: 'All' }]} />}>
      {!i.total ? <Empty icon={BarChart3} text="No leads in this period yet." /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div>
            <p className={`${EYEBROW} mb-2`}>How far they get</p>
            <div className="flex flex-col gap-1.5">
              {i.reached.map((r, ix) => (
                <div key={r.stage} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-slate-600 shrink-0">{r.label}</span>
                  <span className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                    <motion.span className="block h-full rounded-md bg-[#3D52A0]" initial={{ width: 0 }} animate={{ width: `${(r.count / top) * 100}%` }} transition={{ duration: 0.8, delay: ix * 0.08, ease: [0.22, 1, 0.36, 1] }} style={{ opacity: 1 - ix * 0.12 }} />
                  </span>
                  <b className="w-8 text-right font-black text-slate-800 tabular-nums"><CountUp value={r.count} /></b>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {([['Won', i.won], ['Win rate', i.winRate], ['Days to win', i.avgDaysToWin]] as [string, number | null][]).map(([k, v]) => (
                <Tilt key={k} max={8} className="rounded-xl"><div className="rounded-xl border border-slate-200 px-2.5 py-2"><p className="text-base font-black text-slate-800 tabular-nums">{v == null ? '—' : <><CountUp value={v} />{k === 'Win rate' ? '%' : ''}</>}</p><p className="text-[11px] text-slate-500">{k}</p></div></Tilt>
              ))}
            </div>
          </div>
          <div>
            <p className={`${EYEBROW} mb-2`}>Where they come from</p>
            <table className="w-full text-xs">
              <thead><tr className={`${EYEBROW} text-left`}><th className="py-1">Source</th><th className="text-right">Leads</th><th className="text-right">Won</th><th className="text-right">Win rate</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {i.sources.map((s) => (
                  <tr key={s.source}><td className="py-1.5 text-slate-700">{s.label}</td><td className="text-right font-black text-slate-800 tabular-nums">{s.total}</td><td className="text-right tabular-nums text-slate-700">{s.won}</td>
                    <td className="text-right">{s.winRate == null ? <span className="text-slate-400">—</span> : <Chip tone={s.winRate >= 50 ? 'emerald' : s.winRate >= 25 ? 'amber' : 'rose'}>{s.winRate}%</Chip>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className={`${EYEBROW} mb-2`}>Why they are lost</p>
            {!i.reasons.length ? <p className="text-xs text-slate-500">None lost in this period.</p> : (
              <div className="flex flex-col gap-1.5">
                {i.reasons.map((r, ix) => (
                  <div key={r.reason} className="flex items-center gap-2 text-xs">
                    <span className="w-32 text-slate-600 shrink-0 truncate">{r.reason}</span>
                    <span className="flex-1 h-4 rounded-md bg-slate-100 overflow-hidden"><motion.span className="block h-full rounded-md bg-rose-400" initial={{ width: 0 }} animate={{ width: `${(r.count / maxReason) * 100}%` }} transition={{ duration: 0.7, delay: ix * 0.06 }} /></span>
                    <b className="w-6 text-right font-black text-slate-800 tabular-nums">{r.count}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ── On a lead: the next best action, and messages ready to send ──────────── */

export function SmartPanel({ lead: l, canEdit, onAct, onSent }: {
  lead: Lead;
  canEdit: boolean;
  onAct: (s: Suggestion) => void;
  /** A message was sent on WhatsApp: log it on the lead. */
  onSent: (label: string) => void;
}) {
  const d = useDesk();
  const s = nextBestAction(l, d.now);
  const h = leadHeat(l, d.now);
  const [tpl, setTpl] = useState<TemplateId | null>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const main = mainPerson(l);
  const open = (id: TemplateId) => { setTpl(id); setText(templateText(id, l, { me: d.me.name, studio: d.studioName })); setCopied(false); };
  const shown = TEMPLATES.filter((t) => (t.id === 'revisit' ? l.stage === 'lost' : l.stage !== 'lost') && (t.id !== 'meeting' || l.next?.kind === 'meeting') && (t.id !== 'proposal' || l.stage === 'proposal' || l.stage === 'measured'));
  return (
    <Panel icon={Lightbulb} title="What to do next" blurb="Worked out from the lead: its stage, what we know and how lately we spoke"
      right={h ? <HeatChip lead={l} withScore /> : undefined}>
      {s ? (
        <motion.div key={s.title} initial={{ opacity: 0, rotateX: -25, y: 6 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} style={{ transformPerspective: 800 }}
          className="rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/5 px-3 py-2.5">
          <p className="text-sm font-bold text-slate-800">{s.title}</p>
          <p className="text-xs text-slate-600 mt-0.5">{s.why}</p>
          {canEdit && (
            <div className="mt-2">
              {s.action === 'call' && main?.phone
                ? <a href={`tel:+${dialable(main.phone)}`} onClick={() => onAct(s)} className={`${btnPri} !py-1.5 !text-xs pp-press`}><Phone className="w-3.5 h-3.5" />Call {firstNameOf(main.name)}</a>
                : s.action === 'template' && s.template
                  ? <button type="button" className={`${btnPri} !py-1.5 !text-xs pp-press`} onClick={() => open(s.template!)}><MessageCircle className="w-3.5 h-3.5" />Write it</button>
                  : <button type="button" className={`${btnPri} !py-1.5 !text-xs pp-press`} onClick={() => onAct(s)}><Check className="w-3.5 h-3.5" />{s.action === 'book' ? 'Book it' : s.action === 'measure' ? 'Book the measurement' : s.action === 'ask' ? 'Fill it in' : s.action === 'open' ? 'Open it' : 'Do it'}</button>}
            </div>
          )}
        </motion.div>
      ) : <p className="text-xs text-slate-500">{l.stage === 'won' ? 'Won: the project carries it from here.' : 'Nothing to suggest. Set a day to try again if it is worth another go.'}</p>}
      {h && h.reasons.length > 0 && <p className="text-[11px] text-slate-500 mt-2">Why it is {h.heat}: {h.reasons.join(' · ')}</p>}
      {canEdit && shown.length > 0 && (
        <div className="mt-4">
          <p className={`${EYEBROW} mb-1.5`}>Messages ready to send</p>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((t) => (
              <button key={t.id} type="button" onClick={() => (tpl === t.id ? setTpl(null) : open(t.id))}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${tpl === t.id ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{t.label}</button>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {tpl && (
              <motion.div key={tpl} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <textarea aria-label="Message" rows={5} className={`${input} mt-2 text-xs leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex flex-wrap gap-2 mt-2">
                  {main?.phone && (
                    <a href={waLink(main.phone, text)} target="_blank" rel="noreferrer" className={`${btnPri} !py-1.5 !text-xs pp-press`}
                      onClick={() => { onSent(TEMPLATES.find((t) => t.id === tpl)?.label || 'Message'); setTpl(null); }}><Send className="w-3.5 h-3.5" />Send on WhatsApp</a>
                  )}
                  <button type="button" className={btnSm} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* select by hand */ } }}>
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy'}
                  </button>
                  <button type="button" className={btnSm} onClick={() => setTpl(null)}><X className="w-3.5 h-3.5" />Close</button>
                </div>
                {main?.phone && <p className="text-[11px] text-slate-500 mt-1">Sending opens WhatsApp with the message and logs it on the lead.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Panel>
  );
}

