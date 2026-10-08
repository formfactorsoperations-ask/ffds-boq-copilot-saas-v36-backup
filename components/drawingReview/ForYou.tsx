import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Bell, CalendarDays, Check, Circle, Clock, Eye, Flame, LayoutGrid, ListChecks, Mail,
  PenLine, Presentation, Send, Sparkles, Undo2, Upload, Users, X, type LucideIcon,
} from 'lucide-react';
import { stateOf } from '../../lib/drawingReview';
import { dueOf, reviewQueue, roundWarn, type Suggestion, type Viewer } from '../../lib/designDesk';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { roomLabel, ago, shortDate, firstName, Initials } from './ui';
import { SectionHead, SheetRow, TONE, IconTile, type Tone, type RowProps } from './DeskParts';

/*
  FOR YOU: what needs this person now, most urgent first, with one button to
  start. Everything else sits below it, folded away until asked for.
*/

export interface DragKit {
  can: (d: ReviewDrawing) => boolean;
  start: (d: ReviewDrawing) => (e: React.DragEvent) => void;
  end: () => void;
  dragging: string | null;
}

interface Props {
  scope: ReviewDrawing[];
  all: ReviewDrawing[];
  viewer: Viewer;
  uploader: boolean;
  isAll: boolean;
  scopeName: string;
  projectOf: (id: string) => { name: string; code: string; color: string };
  suggestions: Suggestion[];
  onSuggestion: (s: Suggestion) => void;
  onDismiss: (key: string) => void;
  onOpen: (d: ReviewDrawing) => void;
  onSend: (d: ReviewDrawing) => void;
  sending: Set<string>;
  onRemind: (d: ReviewDrawing) => void;
  onGoProject: (id: string) => void;
  drag: DragKit;
}

const keyOf = (d: ReviewDrawing) => `${d.projectId}/${d.id}`;
const DUE_TONE: Record<string, [Tone, LucideIcon]> = { late: ['red', Flame], soon: ['amber', Clock], week: ['indigo', CalendarDays], later: ['grey', CalendarDays] };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const SUGGESTION_LOOK: Record<Suggestion['kind'], [LucideIcon, string]> = {
  overdue: [Flame, 'Review now'], round: [AlertTriangle, 'Open the sheet'], stale: [Bell, 'Remind'], notStarted: [Circle, 'See them'],
  present: [Presentation, 'See the room'], openNotes: [ListChecks, 'Fix notes'], readyDue: [Send, 'Send it'], waitingLate: [Clock, 'See the sheet'], elsewhere: [LayoutGrid, 'Show all projects'],
};

export default function ForYou(props: Props) {
  const { scope, all, viewer, uploader, isAll, scopeName, projectOf, suggestions, onSuggestion, onDismiss, onOpen, onSend, sending, onRemind, onGoProject, drag } = props;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => () => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const where = isAll ? 'across all projects' : `in ${scopeName}`;
  const mine = (d: ReviewDrawing) => !!viewer.email && d.review?.designer?.email === viewer.email;
  const by = (list: ReviewDrawing[], s: string) => list.filter((d) => stateOf(d.review) === s);

  const row = (d: ReviewDrawing, i: number, o: { who?: boolean; detail?: 'due' | 'sent' | 'progress' | 'approved'; action?: RowProps['action'] } = {}): React.ReactNode => {
    const r = d.review;
    let detail: RowProps['detail'] = null;
    if (o.detail === 'progress') detail = r?.marksTotal ? { text: `${r.marksTotal - r.marksOpen} of ${r.marksTotal} fixed`, tone: 'amber', icon: ListChecks } : { text: 'Returned', tone: 'amber', icon: Undo2 };
    else if (o.detail === 'sent') detail = { text: `Sent ${ago(r?.submittedAt)}`, tone: 'grey', icon: Send };
    else if (o.detail === 'approved') detail = { text: `${r?.selfApproved ? 'Self-approved' : 'Approved'} ${shortDate(r?.decidedAt)}`, tone: 'green', icon: Check };
    else {
      const due = dueOf(d.targetDate);
      if (due) { const [tone, icon] = DUE_TONE[due.tone]; detail = { text: due.label, tone, icon }; }
      else if (stateOf(r) === 'IN_REVIEW') detail = { text: `Sent ${ago(r?.submittedAt)}`, tone: 'grey', icon: Send };
    }
    const p = projectOf(d.projectId);
    const whoName = o.who ? (r?.designer?.email === viewer.email ? 'You' : r?.designer?.name || '') : null;
    const meta = [isAll ? p.name : null, roomLabel(d.roomName), r?.versionNo ? `v${r.versionNo}` : null, o.who && r?.designer ? (whoName === 'You' ? 'your own' : firstName(r.designer.name)) : null].filter(Boolean).join(' · ');
    const can = drag.can(d);
    const round = roundWarn(r);
    return (
      <SheetRow key={keyOf(d)} d={d} meta={meta} project={isAll ? p : null} who={whoName && whoName !== 'You' ? whoName : null} detail={detail}
        round={round ? `Round ${round}` : undefined} action={o.action || null} delay={Math.min(i, 8) * 45}
        draggable={can} dragging={drag.dragging === keyOf(d)} onDragStart={can ? drag.start(d) : undefined} onDragEnd={drag.end} onOpen={() => onOpen(d)} />
    );
  };
  const sendAction = (d: ReviewDrawing): RowProps['action'] => ({ label: sending.has(keyOf(d)) ? 'Sending…' : `Send v${d.review?.versionNo || 1}`, icon: Send, busy: sending.has(keyOf(d)), run: () => onSend(d) });
  const fixAction = (d: ReviewDrawing): RowProps['action'] => ({ label: 'Fix notes', icon: PenLine, run: () => onOpen(d) });

  type Sec = { key: string; icon: LucideIcon; tone: Tone; title: string; sub: string; rows: React.ReactNode[]; fold?: boolean; empty?: string; hint?: string; defaultOpen?: boolean };
  const queue = useMemo(() => reviewQueue(scope), [scope]);
  const myFix = by(scope, 'CHANGES_REQUESTED').filter(mine);
  const myReady = by(scope, 'DRAFT').filter(mine);
  const elsewhere = all.filter((d) => mine(d) && !scope.includes(d) && ['CHANGES_REQUESTED', 'DRAFT'].includes(stateOf(d.review)));
  const recentApproved = by(scope, 'APPROVED').sort((a, b) => (b.review?.decidedAt || 0) - (a.review?.decidedAt || 0)).slice(0, 8);
  const dragHint = 'Send with the button, or drag a sheet by its handle to the Design Head.';

  let sections: Sec[];
  let headline: { count?: number; title: string; sub: string; cta?: string; go?: () => void };
  if (viewer.reviewer) {
    const back = scope.filter((d) => !mine(d) && ['CHANGES_REQUESTED', 'DRAFT'].includes(stateOf(d.review)))
      .sort((a, b) => (a.review?.decidedAt || a.review?.updatedAt || 0) - (b.review?.decidedAt || b.review?.updatedAt || 0));
    sections = [
      { key: 'queue', icon: Eye, tone: 'indigo', title: 'Waiting for your review', sub: 'Most urgent first', rows: queue.map((d, i) => row(d, i, { who: true })), empty: `Nothing waiting ${where}. New sheets appear the moment a designer sends them.` },
      ...(myFix.length || myReady.length ? [{ key: 'own', icon: PenLine, tone: 'amber' as Tone, title: 'Your own sheets', sub: 'Returned to you, or ready to send', hint: myReady.length ? dragHint : undefined,
        rows: [...myFix.map((d, i) => row(d, i, { detail: 'progress', action: fixAction(d) })), ...myReady.map((d, i) => row(d, i + myFix.length, { action: sendAction(d) }))] }] : []),
      { key: 'back', icon: Undo2, tone: 'amber', title: 'Back with designers', sub: 'Changes requested, or uploaded and not sent', fold: true, empty: 'Nothing is back with the designers.',
        rows: back.map((d, i) => row(d, i, { who: true, detail: stateOf(d.review) === 'CHANGES_REQUESTED' ? 'progress' : 'due',
          action: d.review?.designer?.email ? { label: 'Remind', icon: Mail, quiet: true, run: () => onRemind(d) } : null })) },
      { key: 'approved', icon: Check, tone: 'green', title: 'Approved', sub: 'Recently signed off', fold: true, empty: 'Nothing approved yet.', rows: recentApproved.map((d, i) => row(d, i, { who: true, detail: 'approved' })) },
    ];
    const q0 = queue[0];
    const due = q0 && dueOf(q0.targetDate);
    headline = q0
      ? { count: queue.length, title: `${queue.length === 1 ? 'sheet' : 'sheets'} waiting for your review`, sub: `${isAll ? 'Across all projects. ' : ''}Most urgent: ${q0.name}${due ? ` · ${due.label.replace(/^\w/, (c) => c.toLowerCase())}` : ''}`, cta: 'Start reviewing', go: () => onOpen(q0) }
      : { title: 'You are all caught up', sub: `Nothing is waiting ${where}.` };
  } else {
    const notStarted = by(scope, 'NONE');
    const withHead = by(scope, 'IN_REVIEW').filter(mine);
    sections = [
      ...(myFix.length ? [{ key: 'fix', icon: PenLine, tone: 'amber' as Tone, title: 'Fix and resend', sub: 'The Design Head left notes', rows: myFix.map((d, i) => row(d, i, { detail: 'progress', action: fixAction(d) })) }] : []),
      ...(myReady.length ? [{ key: 'ready', icon: Send, tone: 'indigo' as Tone, title: 'Ready to send', sub: 'Uploaded, not sent yet', hint: dragHint, rows: myReady.map((d, i) => row(d, i, { action: sendAction(d) })) }] : []),
      ...(uploader && notStarted.length ? [{ key: 'none', icon: Circle, tone: 'grey' as Tone, title: 'Not started', sub: 'No PDF yet. Drop one anywhere on this page.', fold: true, defaultOpen: !myFix.length && !myReady.length,
        rows: notStarted.map((d, i) => row(d, i, { action: { label: 'Upload', icon: Upload, quiet: true, run: () => onOpen(d) } })) }] : []),
      { key: 'withHead', icon: Eye, tone: 'indigo', title: 'With the Design Head', sub: 'Waiting for a decision', fold: true, empty: 'Nothing is waiting for a decision.', rows: withHead.map((d, i) => row(d, i, { detail: 'sent' })) },
      { key: 'approved', icon: Check, tone: 'green', title: 'Approved', sub: 'Signed off by the Design Head', fold: true, empty: 'Nothing approved yet.', rows: recentApproved.filter(mine).map((d, i) => row(d, i, { detail: 'approved' })) },
    ];
    const needs = myFix.length + myReady.length;
    const elseNames = [...new Set(elsewhere.map((d) => d.projectId))];
    const elseText = elsewhere.length ? ` ${plural(elsewhere.length, 'more sheet')} need${elsewhere.length === 1 ? 's' : ''} you in ${projectOf(elseNames[0]).name}${elseNames.length > 1 ? ' and elsewhere' : ''}.` : '';
    if (myFix.length) {
      const f = myFix[0]; const n = f.review?.marksOpen || f.review?.marksTotal || 0;
      headline = { count: needs, title: `${needs === 1 ? 'thing needs' : 'things need'} you ${where}`, sub: `${f.name} came back${n ? ` with ${plural(n, 'note')} to fix` : ''}.${elseText}`, cta: 'Fix notes', go: () => onOpen(f) };
    } else if (myReady.length) {
      const r = myReady[0];
      headline = { count: needs, title: `${needs === 1 ? 'thing needs' : 'things need'} you ${where}`, sub: `${myReady.length === 1 ? `${r.name} is` : `${myReady.length} sheets are`} ready to send.${elseText}`, cta: `Send ${r.name}`, go: () => onSend(r) };
    } else {
      headline = { title: `Nothing needs you ${where}`, sub: elseText ? elseText.trim() : 'Drop PDFs anywhere on this page to add new versions.', cta: elsewhere.length ? `Go to ${projectOf(elseNames[0]).name}` : undefined, go: elsewhere.length ? () => onGoProject(elseNames[0]) : undefined };
    }
  }

  const team = useMemo(() => {
    if (!viewer.reviewer) return [];
    const m = new Map<string, { name: string; fix: number; ready: number; review: number }>();
    scope.forEach((d) => {
      const k = d.review?.designer?.email; const s = stateOf(d.review);
      if (!k || s === 'APPROVED' || s === 'NONE') return;
      const e = m.get(k) || { name: d.review?.designer?.name || k, fix: 0, ready: 0, review: 0 };
      if (s === 'CHANGES_REQUESTED') e.fix++; else if (s === 'DRAFT') e.ready++; else e.review++;
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => (b.fix + b.ready + b.review) - (a.fix + a.ready + a.review));
  }, [scope, viewer.reviewer]);
  const maxLoad = Math.max(1, ...team.map((t) => t.fix + t.ready + t.review));

  return (
    <div className="flex flex-col gap-4">
      <div className="dd-rise flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[18px] border border-[#E4E4DE] bg-white px-6 py-5">
        {headline.count
          ? <div className="min-w-[44px] font-display text-[52px] font-semibold leading-none text-[#4146C8]">{headline.count}</div>
          : <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#E3F2EA] text-[#1B6E4F]"><Check size={26} strokeWidth={2.4} /></div>}
        <div className="min-w-0 flex-[1_1_280px]">
          <div className="font-display text-[21px] font-semibold text-[#17191E]">{headline.title}</div>
          <div className="mt-0.5 text-[#5F636D]">{headline.sub}</div>
        </div>
        {headline.cta && headline.go && (
          <button type="button" onClick={headline.go} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white transition hover:bg-[#3439AD] active:scale-[.98]">
            {headline.cta}<ArrowRight size={16} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div>
          <div className="mx-1 mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.09em] text-[#5F636D]">
            <Sparkles size={14} className="text-[#4146C8]" />Worth a look
            <span className="font-semibold normal-case tracking-normal text-[#8A8E97]">· picked from deadlines, rounds and rooms</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
            {suggestions.map((s, i) => {
              const [Icon, cta] = SUGGESTION_LOOK[s.kind];
              const label = s.kind === 'stale' && s.row?.review?.designer?.name ? `Remind ${firstName(s.row.review.designer.name)}` : s.kind === 'readyDue' && s.row ? `Send v${s.row.review?.versionNo || 1}` : cta;
              return (
                <div key={s.key} className="dd-rise flex items-start gap-3 rounded-[18px] border border-[#E4E4DE] bg-white py-3.5 pl-4 pr-3" style={{ animationDelay: `${i * 60}ms` }}>
                  <IconTile icon={Icon} tone={s.tone} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#17191E]">{s.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-[#5F636D]">{s.sub}</div>
                    <button type="button" onClick={() => onSuggestion(s)} className="mt-2.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-[10px] border border-[#DCDCD5] bg-white px-3 text-[13px] font-bold text-[#17191E] transition hover:border-[#A9AAA2]">
                      {label}<ArrowRight size={14} strokeWidth={2.4} />
                    </button>
                  </div>
                  <button type="button" onClick={() => onDismiss(s.key)} aria-label={`Dismiss: ${s.title}`} title="Dismiss" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[#6B6F78] hover:bg-[#EBEBE5] hover:text-[#17191E]"><X size={14} strokeWidth={2.4} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sections.map((s) => {
        const isOpen = !s.fold || (open[s.key] ?? !!s.defaultOpen);
        return (
          <section key={s.key} className="rounded-[18px] border border-[#E4E4DE] bg-white px-2.5 pb-2.5 pt-2">
            <SectionHead icon={s.icon} tone={s.tone} title={s.title} count={s.rows.length} sub={s.sub} open={isOpen} onToggle={s.fold ? toggle(s.key) : undefined} />
            {isOpen && (s.rows.length
              ? <div className="flex flex-col gap-0.5">{s.rows}{s.hint && <div className="px-3 pb-0.5 pt-1 text-[12px] text-[#5F636D]">{s.hint}</div>}</div>
              : s.empty ? <div className="px-2.5 pb-3.5 pt-4 text-center text-[13px] text-[#5F636D]">{s.empty}</div> : null)}
          </section>
        );
      })}

      {viewer.reviewer && team.length > 0 && (
        <section className="rounded-[18px] border border-[#E4E4DE] bg-white px-2.5 pb-2.5 pt-2">
          <SectionHead icon={Users} tone="grey" title="Team" sub={`Who has what ${where}`} open={!!open.team} onToggle={toggle('team')} />
          {open.team && (
            <div className="grid gap-2.5 px-1.5 pb-1.5 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {team.map((t, i) => {
                const total = t.fix + t.ready + t.review;
                const bits = [t.fix && `${t.fix} to fix`, t.ready && `${t.ready} ready to send`, t.review && `${t.review} with you`].filter(Boolean);
                return (
                  <div key={t.name} className="dd-rise rounded-[14px] bg-[#F6F6F2] p-3" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex items-center gap-3">
                      <Initials name={t.name} size={34} color="#4146C8" />
                      <span className="min-w-0 flex-1"><b className="block truncate text-[#17191E]">{t.name}</b><span className="block text-[12.5px] text-[#5F636D]">{bits.join(' · ')}</span></span>
                      {i === 0 && total > 1 && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: TONE.amber.bg, color: TONE.amber.ink }}>Busiest</span>}
                    </div>
                    <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-[#E4E4DE]" style={{ width: `${Math.max(14, (total / maxLoad) * 100)}%` }}>
                      <i style={{ flex: t.fix, background: '#C77A1A' }} /><i style={{ flex: t.ready, background: '#9A9DA5' }} /><i style={{ flex: t.review, background: '#4146C8' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
