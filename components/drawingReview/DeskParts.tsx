import React from 'react';
import { Check, ChevronRight, Circle, Eye, GripVertical, Send, Undo2, type LucideIcon } from 'lucide-react';
import { stateOf } from '../../lib/drawingReview';
import { type DeskState } from '../../lib/designDesk';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { Thumb, Initials } from './ui';

/*
  The small pieces Design Desk is built from: status pills, project marks,
  section headers, a sheet row and a sheet card. Three status colours only
  (in review, changes, approved); project colours mean the project and
  nothing else. Colours are written out in full: Tailwind arbitrary values
  with commas fail without a word.
*/

export const C = {
  ink: '#17191E', sub: '#5F636D', faint: '#8A8E97', line: '#E4E4DE', soft: '#F6F6F2', bg: '#F5F5F1',
  indigo: '#4146C8', indigoDeep: '#3439AD', approve: '#1F7A57', mark: '#D9354B',
};

export type Tone = 'indigo' | 'amber' | 'green' | 'grey' | 'red';
export const TONE: Record<Tone, { bg: string; ink: string }> = {
  indigo: { bg: '#ECEDFB', ink: '#3A3FB8' },
  amber: { bg: '#FBF1E3', ink: '#8F4C07' },
  green: { bg: '#E3F2EA', ink: '#1B6E4F' },
  grey: { bg: '#EEEEEA', ink: '#4F535C' },
  red: { bg: '#FCE8EA', ink: '#B4232F' },
};

export const STATUS: Record<DeskState, { label: string; tone: Tone; Icon: LucideIcon }> = {
  NONE: { label: 'Not started', tone: 'grey', Icon: Circle },
  DRAFT: { label: 'Ready to send', tone: 'grey', Icon: Send },
  IN_REVIEW: { label: 'In review', tone: 'indigo', Icon: Eye },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'amber', Icon: Undo2 },
  APPROVED: { label: 'Approved', tone: 'green', Icon: Check },
};

export function Chip({ tone = 'grey', icon: Icon, children, title, small }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; title?: string; small?: boolean }) {
  const t = TONE[tone];
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-bold ${small ? 'h-[22px] px-2 text-[11px]' : 'h-[26px] px-2.5 text-[12px]'}`} style={{ background: t.bg, color: t.ink }}>
      {Icon && <Icon size={small ? 11 : 13} strokeWidth={2.4} aria-hidden />}{children}
    </span>
  );
}

export function StatusPill({ state }: { state: DeskState }) {
  const s = STATUS[state];
  return <Chip tone={s.tone} icon={s.Icon}>{s.label}</Chip>;
}

export function IconTile({ icon: Icon, tone = 'grey', size = 30 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  const t = TONE[tone];
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: t.bg, color: t.ink }} aria-hidden>
      <Icon size={Math.round(size * 0.53)} strokeWidth={2.1} />
    </span>
  );
}

export function ProjectMark({ code, color, size = 36, round = false }: { code: string; color: string; size?: number; round?: boolean }) {
  return (
    <span className="grid shrink-0 place-items-center font-extrabold tracking-wide text-white" aria-hidden
      style={{ width: size, height: size, borderRadius: round ? 999 : Math.round(size * 0.27), background: color, fontSize: Math.max(8.5, Math.round(size * 0.34)) }}>
      {code}
    </span>
  );
}

export function SectionHead({ icon, tone, title, count, sub, open, onToggle }: {
  icon: LucideIcon; tone: Tone; title: string; count?: number; sub?: string; open?: boolean; onToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-2 pb-2 pt-2.5">
      <IconTile icon={icon} tone={tone} />
      <h2 className="font-display text-[17px] font-semibold text-[#17191E]">{title}</h2>
      {count !== undefined && <span className="rounded-full bg-[#EEEEEA] px-2 py-0.5 text-[12px] font-bold text-[#4F535C]">{count}</span>}
      {sub && <span className="hidden truncate text-[12.5px] text-[#5F636D] sm:inline">{sub}</span>}
      <span className="flex-1" />
      {onToggle && (
        <button type="button" onClick={onToggle} aria-expanded={!!open} className="inline-flex min-h-[36px] items-center gap-1 rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] hover:text-[#17191E]">
          {open ? 'Hide' : 'Show'}<ChevronRight size={14} strokeWidth={2.4} className="transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        </button>
      )}
    </div>
  );
}

/** A sheet's preview, A-series proportions; the first PDF's spot when there is none yet. */
export function SheetThumb({ d, className = '' }: { d: ReviewDrawing; className?: string }) {
  const r = d.review;
  return (
    <span className={`relative block aspect-[1.414/1] shrink-0 overflow-hidden rounded-[5px] bg-white ${className}`} style={{ boxShadow: '0 0 0 1px rgba(23,25,30,.09), 0 1px 2px rgba(23,25,30,.06)' }}>
      {r?.versionId
        ? (r.thumbPath ? <Thumb path={r.thumbPath} className="h-full w-full" /> : <span className="grid h-full w-full place-items-center text-[10px] font-bold text-[#6B6F78]">v{r.versionNo} · PDF</span>)
        : <span className="grid h-full w-full place-items-center bg-[#F3F3EF] text-[10px] font-bold text-[#6B6F78]">No PDF</span>}
    </span>
  );
}

export interface RowProps {
  d: ReviewDrawing;
  meta: string;
  project?: { code: string; color: string } | null;
  who?: string | null;
  detail?: { text: string; tone: Tone; icon?: LucideIcon } | null;
  round?: string;
  action?: { label: string; icon?: LucideIcon; quiet?: boolean; disabled?: boolean; busy?: boolean; run: () => void } | null;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onOpen: () => void;
  delay?: number;
}

export const SheetRow: React.FC<RowProps> = ({ d, meta, project, who, detail, round, action, draggable, dragging, onDragStart, onDragEnd, onOpen, delay = 0 }) => {
  return (
    <div className="dd-rise flex items-center gap-2 rounded-[14px] py-1 pl-1 pr-2.5 transition hover:bg-[#F6F6F2]"
      style={{ animationDelay: `${delay}ms`, opacity: dragging ? 0.45 : 1 }}
      draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {draggable
        ? <span className="grid h-10 w-5 shrink-0 cursor-grab place-items-center text-[#9A9DA5]" title="Drag to the Design Head to send" aria-hidden><GripVertical size={16} /></span>
        : <span className="w-1.5 shrink-0" />}
      <button type="button" onClick={onOpen} aria-label={`Open ${d.name}`} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3.5 rounded-[10px] p-1 text-left">
        <SheetThumb d={d} className="w-[76px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-[#17191E]">{d.name}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            {project && <ProjectMark code={project.code} color={project.color} size={18} />}
            <span className="truncate text-[12.5px] text-[#5F636D]">{meta}</span>
          </span>
        </span>
        {round && <span className="hidden sm:inline-flex"><Chip tone="red" title="Two review rounds are included">{round}</Chip></span>}
        {who && <span className="hidden sm:inline-flex"><Initials name={who} size={28} color={C.indigo} /></span>}
        {detail && <span className={action ? 'hidden sm:inline-flex' : 'inline-flex'}><Chip tone={detail.tone} icon={detail.icon}>{detail.text}</Chip></span>}
        {!action && <ChevronRight size={18} className="shrink-0 text-[#8A8E97]" aria-hidden />}
      </button>
      {action && (
        <button type="button" onClick={action.run} disabled={action.disabled || action.busy}
          className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-[10px] border px-3.5 text-[13px] font-bold transition disabled:opacity-45 ${action.quiet ? 'border-[#DCDCD5] bg-white text-[#17191E] hover:border-[#A9AAA2]' : 'border-transparent bg-[#4146C8] text-white hover:bg-[#3439AD]'}`}>
          {action.icon && <action.icon size={14} strokeWidth={2.3} aria-hidden />}{action.label}
        </button>
      )}
    </div>
  );
};

interface TileProps {
  d: ReviewDrawing; meta: string; studio?: boolean; draggable?: boolean; dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void; onOpen: () => void; delay?: number;
}

export const SheetTile: React.FC<TileProps> = ({ d, meta, studio, draggable, dragging, onDragStart, onDragEnd, onOpen, delay = 0 }) => {
  return (
    <div className="dd-rise" style={{ animationDelay: `${delay}ms`, opacity: dragging ? 0.45 : 1 }} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <button type="button" onClick={onOpen} aria-label={`Open ${d.name}`}
        className={`flex w-full flex-col gap-2.5 rounded-[18px] border border-[#E4E4DE] bg-white p-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(23,25,30,0.45)] ${draggable ? 'cursor-grab' : ''}`}>
        <SheetThumb d={d} className="w-full rounded-[8px]" />
        <span className="block px-1">
          <span className="block truncate font-bold text-[#17191E]">{d.name}</span>
          <span className="block truncate text-[12.5px] text-[#5F636D]">{meta}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
          <StatusPill state={stateOf(d.review)} />
          {studio && <Chip tone="grey">Studio only</Chip>}
        </span>
      </button>
    </div>
  );
};

/** Entrance animations, as CSS (a framer exit inside a tab stalls the app's tab transitions). */
export const DeskStyles = () => (
  <style>{`
    @keyframes ddRise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
    @keyframes ddPop { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: none } }
    @keyframes ddSlide { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }
    @keyframes ddBreathe { 50% { transform: scale(1.02) } }
    .dd-rise { animation: ddRise .42s cubic-bezier(.2,.8,.2,1) both }
    .dd-pop { animation: ddPop .28s cubic-bezier(.2,1.2,.4,1) both; transform-origin: top left }
    .dd-slide { animation: ddSlide .38s cubic-bezier(.2,.8,.2,1) both }
    .dd-breathe { animation: ddBreathe 2.2s ease-in-out infinite }
    @media (prefers-reduced-motion: reduce) { .dd-rise, .dd-pop, .dd-slide, .dd-breathe { animation: none } }
  `}</style>
);
