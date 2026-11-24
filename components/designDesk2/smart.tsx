import React, { useState } from 'react';
import { BellRing, CalendarClock, Check, HardHat, IndianRupee, Loader2, PuzzleIcon, Repeat2, type LucideIcon } from 'lucide-react';
import { REPEAT_WINDOW_DAYS, type RepeatMemo } from '../../lib/deskAi';
import { stateOf } from '../../lib/drawingReview';
import { canNudge, cleanDate, missingDrawings, nudgeTarget, siteRisk, siteRisks, type RoundToBill } from '../../lib/deskSmart';
import type { Viewer } from '../../lib/designDesk';
import { nudgeHolder, setSiteDate, type ReviewDrawing } from '../../services/drawingReviewService';
import { roomLabel, useToast } from '../drawingReview/ui';
import { Btn, Card, SectionTitle, Tag, cx } from './parts';

/*
  DESIGN DESK 2.0, PHASE 3A on screen: the smart features that need no AI
  (rules in lib/deskSmart.ts).

    WorthKnowing   Home's "Worth knowing": revision rounds waiting to be
                   billed, drawings that may miss the site date, drawings
                   missing beside their pair;
    SiteTag        "Site needs it 1 Dec" on a drawing's row, when it matters;
    SiteLine       the same on the drawing screen, where the leads set the date;
    NudgeButton    reminds whoever is holding a drawing, when a person presses
                   it. Nothing is reminded by itself and nothing goes to
                   WhatsApp (owner, 24 Nov 2026: held back for now).
*/

/* ------------------------------------------------------------ the site date */

/** A tag for a drawing that is late for site, will be at this pace, or is ready and due. Nothing when it is on track. */
export const SiteTag: React.FC<{ d: ReviewDrawing }> = ({ d }) => {
  const r = siteRisk(d);
  if (!r || r.state === 'ok') return null;
  return <Tag tone={r.state === 'ready' ? 'you' : 'bad'} icon={HardHat} title={r.line}>{r.label}</Tag>;
};

/** The site date on the drawing screen: what it means today, and (for the leads) the field that sets it. */
export const SiteLine: React.FC<{ d: ReviewDrawing; canSet: boolean }> = ({ d, canSet }) => {
  const toast = useToast();
  const r = siteRisk(d);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (value: string) => {
    const date = value ? cleanDate(value) : null;
    if (value && !date) return;
    setBusy(true);
    try {
      await setSiteDate({ orgId: d.orgId, projectId: d.projectId, drawingId: d.id }, date);
      toast({ ok: true, title: date ? 'Site date saved' : 'Site date cleared', sub: date ? 'The desk warns when the drawing will not reach site by then.' : undefined });
      setEditing(false);
    } catch (e: any) {
      toast({ title: 'Not saved', sub: e?.message });
    } finally { setBusy(false); }
  };
  if (!r && !d.siteDate && !canSet) return null;
  if (d.gfcStatus === 'issued') return null;
  const tone = r?.state === 'late' || r?.state === 'risk' ? 'bg-rose-50 text-rose-900' : r?.state === 'ready' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700';
  return (
    <div className={cx('mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl px-3 py-2 text-sm', tone)}>
      <HardHat size={16} className="shrink-0" aria-hidden />
      {editing ? (
        <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-bold">Site needs it on
          <input type="date" autoFocus defaultValue={d.siteDate || ''} disabled={busy} onChange={(e) => { if (e.target.value) void save(e.target.value); }}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-600" />
          {d.siteDate && <button type="button" disabled={busy} onClick={() => save('')} className="min-h-[40px] rounded-lg px-2 text-xs font-bold underline">Clear</button>}
          <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-[40px] rounded-lg px-2 text-xs font-bold underline">Cancel</button>
        </label>
      ) : (
        <>
          <span className="min-w-0 flex-1">{r ? r.line : 'No site date yet.'}</span>
          {canSet && <button type="button" onClick={() => setEditing(true)} className="min-h-[36px] shrink-0 rounded-lg px-2 text-xs font-bold underline">{d.siteDate ? 'Change' : 'Set the site date'}</button>}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------ nudges */

/**
 * Reminds whoever is holding the drawing, in their bell and on their phone.
 * Shown only when someone else in the studio has had it for a day or more.
 */
export const NudgeButton: React.FC<{ d: ReviewDrawing; viewer: Viewer; projectName: string; quiet?: boolean }> = ({ d, viewer, projectName, quiet }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const state = canNudge(d.review);
  const held = state.held;
  if (!held || held.days < 1) return null;
  /* Nobody nudges themselves. */
  if (held.who === 'head' ? viewer.reviewer : d.review?.designer?.email === viewer.email) return null;
  const to = nudgeTarget(d.review, held);
  const nudge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await nudgeHolder({ orgId: d.orgId, projectId: d.projectId, drawingId: d.id });
      setSent(true);
      toast({ ok: true, title: `Reminder sent to ${to}`, sub: `${d.name} has waited ${held.days === 1 ? '1 day' : `${held.days} days`}. It is in their bell and on their phone.` });
    } catch (err: any) {
      toast({ title: 'No reminder sent', sub: err?.message });
    } finally { setBusy(false); }
  };
  return (
    <Btn kind={quiet ? 'quiet' : 'plain'} icon={busy ? Loader2 : sent ? Check : BellRing} disabled={busy || sent || !state.ok} onClick={nudge}
      title={sent ? `A reminder went to ${to} just now` : state.ok ? `Remind ${to}: ${d.name} has waited ${held.days === 1 ? '1 day' : `${held.days} days`}` : state.why}
      className={busy ? '[&>svg]:animate-spin' : undefined} aria-label={`Nudge ${to} about ${d.name}`}>{sent ? 'Reminded' : 'Nudge'}</Btn>
  );
};

/* ------------------------------------------------------------ Home: worth knowing */

const Item: React.FC<{ icon: LucideIcon; tone: 'rose' | 'amber' | 'slate'; title: string; children: React.ReactNode; action?: React.ReactNode; i: number }> = ({ icon: Icon, tone, title, children, action, i }) => (
  <Card delay={i * 50} className="phd-lift flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
    <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl',
      tone === 'rose' ? 'bg-rose-100 text-rose-700' : tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}><Icon size={20} aria-hidden /></span>
    <span className="min-w-0 flex-[1_1_260px]">
      <span className="block text-base font-bold text-slate-800">{title}</span>
      <span className="block text-sm text-slate-600">{children}</span>
    </span>
    {action && <span className="flex flex-wrap gap-2">{action}</span>}
  </Card>
);

interface WorthProps {
  rows: ReviewDrawing[];
  /** The Design Head or a lead: sees the missing drawings. */
  reviewer: boolean;
  /** Rounds waiting to be billed or waived; only passed for the roles that bill. */
  rounds?: RoundToBill[];
  /** Mistakes that keep coming back from a designer, as the AI last found them on this device; only passed for reviewers. */
  repeats?: RepeatMemo[];
  projectName: (id: string) => string;
  open: (d: ReviewDrawing) => void;
  goProject: (id: string) => void;
  goMeetings?: (projectId: string) => void;
}

/** "Worth knowing" on Home: the things the desk noticed. Nothing is drawn when there is nothing to say. */
export const WorthKnowing: React.FC<WorthProps> = ({ rows, reviewer, rounds = [], repeats = [], projectName, open, goProject, goMeetings }) => {
  const risks = siteRisks(rows);
  const missing = reviewer ? missingDrawings(rows) : [];
  const list = (names: string[], max = 3) => `${names.slice(0, max).join(' · ')}${names.length > max ? ` and ${names.length - max} more` : ''}`;
  let i = 0;
  return (
    <>
      <SectionTitle hint="The desk noticed these for you">Worth knowing</SectionTitle>
      <div className="flex flex-col gap-3">
        {rounds.slice(0, 3).map((r) => (
          <Item key={`${r.projectId}/${r.meetingId}/${r.room}`} i={i++} icon={IndianRupee} tone="amber" title={`${roomLabel(r.room)} is on revision round ${r.round}`}
            action={goMeetings && <Btn kind="plain" onClick={() => goMeetings(r.projectId)}>Bill or waive it</Btn>}>
            {r.projectName}. {r.included === 1 ? '1 round is' : `${r.included} rounds are`} included, so this one can be charged. It is waiting to be billed or waived.
          </Item>
        ))}
        {repeats.slice(0, 2).map((m) => {
          const r = m.repeats[0];
          const next = rows.find((d) => stateOf(d.review) === 'IN_REVIEW' && String(d.review?.designer?.email || '').toLowerCase() === m.email);
          const who = String(m.name || m.email).split(/[\s@]/)[0];
          return (
            <Item key={m.email} i={i++} icon={Repeat2} tone="rose" title="A mistake keeps coming back"
              action={next && <Btn kind="plain" onClick={() => open(next)}>Open {who}'s latest</Btn>}>
              {who}: {r.title.charAt(0).toLowerCase() + r.title.slice(1)}, noted on {r.drawings} drawings in the last {REPEAT_WINDOW_DAYS} days. Found by AI from your notes.
            </Item>
          );
        })}
        {risks.length > 0 && (
          <Item i={i++} icon={CalendarClock} tone="rose" title={`${risks.length} drawing${risks.length === 1 ? '' : 's'} may miss the site date`}
            action={<Btn kind="plain" onClick={() => open(risks[0].d)}>Open the first</Btn>}>
            {list(risks.map(({ d, risk }) => `${d.name} (${risk.state === 'late' ? `site needed it ${risk.date}` : `site needs it ${risk.date}`})`))}
          </Item>
        )}
        {missing.length > 0 && (
          <Item i={i++} icon={PuzzleIcon} tone="amber" title={`${missing.length} drawing${missing.length === 1 ? ' is' : 's are'} missing beside ${missing.length === 1 ? 'its' : 'their'} pair`}
            action={<Btn kind="plain" onClick={() => goProject(missing[0].d.projectId)}>Open {projectName(missing[0].d.projectId)}</Btn>}>
            {missing[0].line}{missing.length > 1 ? ` ${missing.length - 1} more like it.` : ''}
          </Item>
        )}
        {i === 0 && <p className="flex items-center gap-2 px-1 text-sm text-slate-500"><Check size={16} className="text-emerald-600" aria-hidden />No site date is at risk and nothing is missing.</p>}
      </div>
    </>
  );
};
