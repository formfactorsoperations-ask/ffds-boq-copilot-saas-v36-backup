import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Ruler } from 'lucide-react';
import { STAGE, KIND_LABEL, type FolderStage, type KindTag } from '../../../lib/projectFolders';
import { BOQ_TAG_LABEL, type BoqTag } from '../../../lib/playground/versions';
import { FLOW, dueLabel, type JourneyRow } from '../../../lib/projectsJourney';
import { share, type Health } from '../../../lib/projectHealth';
import { initialsOf } from '../../../services/projectTeam';
import { buttonClass } from '../../ui/kit';

/*
  The small pieces every part of the Projects screen shares (DESIGN.md
  "Projects: journey, needs you, one list"): the photo, the stage chip, the
  two stickers, the journey bar, the next-step button, a designer's face and
  the ··· menu.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/**
 * The project's photo (lib/coverPhoto: its cover, else the latest render the
 * client approved, else its latest render), trying the next when one fails to
 * load; the stage-tinted "No render yet" tile when none does.
 */
export function ProjectPhoto({ row, className, label = true, eager = false, mark }: {
  row: Pick<JourneyRow, 'photo' | 'stage'> & { photos?: string[]; defaultPhotos?: string[] };
  className?: string;
  /** "No render yet" under the ruler; off on the small round photos. */
  label?: boolean;
  eager?: boolean;
  /**
   * How a default picture (lib/defaultPhotos) says it is one: "text", a
   * "No render yet" tag; "icon", a small ruler badge for a row's thumbnail;
   * "none" on the smallest photos. Defaults to text where the label shows.
   */
  mark?: 'text' | 'icon' | 'none';
}) {
  const list = row.photos?.length ? row.photos : row.photo ? [row.photo] : [];
  const key = list.join('|');
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [key]);
  const src = list[at];
  const isDefault = !!src && !!row.defaultPhotos?.includes(src);
  const how = mark || (label ? 'text' : 'none');
  return (
    <div className={cx('pj-ph', className)} style={{ ['--c' as any]: STAGE[row.stage].color }}>
      {src ? (
        <>
          <img key={src} src={src} alt="" loading={eager ? undefined : 'lazy'} referrerPolicy="no-referrer" onError={() => setAt((i) => i + 1)} />
          {isDefault && how === 'text' && (
            <span className="absolute left-2 bottom-2 z-[1] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 text-slate-600 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              <Ruler className="w-3 h-3" aria-hidden />No render yet
            </span>
          )}
          {isDefault && how === 'icon' && (
            <span title="No render yet: a default photo" aria-label="No render yet"
              className="absolute right-1 bottom-1 z-[1] w-[18px] h-[18px] rounded-full bg-white/90 text-slate-600 grid place-items-center shadow-sm">
              <Ruler className="w-3 h-3" aria-hidden />
            </span>
          )}
        </>
      ) : (
        <div className="pj-ph-none"><Ruler className="w-5 h-5" aria-hidden />{label && <span>No render yet</span>}</div>
      )}
    </div>
  );
}

/** A stage chip in its own colour (the stage colours are approved for this screen). */
export function StageChip({ stage }: { stage: FolderStage }) {
  const c = STAGE[stage].color;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${c} 14%, #fff)`, color: c }}>
      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
      {STAGE[stage].label}
    </span>
  );
}

/** The five steps, filled to where the project is. */
export function JourneyBar({ stage }: { stage: FolderStage }) {
  const step = STAGE[stage].step;
  return (
    <div className="pj-bar" style={{ ['--c' as any]: STAGE[stage].color }} aria-label={step >= 0 ? `Step ${step + 1} of 5` : STAGE[stage].label}>
      {FLOW.map((s, i) => <i key={s} className={step >= i ? 'f' : ''} />)}
    </div>
  );
}

const TAG_TIP: Record<KindTag, string> = {
  actual: 'Real client project',
  dummy: 'Dummy: test project, practice data',
  untagged: 'Not tagged yet: click to tag it',
};
const BOQ_TIP: Record<BoqTag, string> = {
  playground: 'Latest BOQ made in the Playground',
  classic: 'Latest BOQ made in the Classic editor',
  none: 'No BOQ yet',
};

/**
 * The two stickers (DESIGN.md "Stickers"): Actual / Dummy / Untagged and how
 * the latest BOQ was made. They press on when they appear, lift and peel on
 * hover with a label saying what they mean, and a click slaps them back down
 * without opening the project. An Untagged one wiggles now and then, and a
 * click on it offers Tag as Actual / Dummy.
 */
export function Stickers({ kind, boq, onTag }: { kind: KindTag; boq: BoqTag; onTag?: (isDummy: boolean) => void }) {
  const [tagging, setTagging] = useState(false);
  const slap = (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    el.classList.remove('slap');
    void el.offsetWidth;
    el.classList.add('slap');
  };
  const keys = (fn: (e: any) => void) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  };
  const tagClick = (e: any) => {
    slap(e);
    if (kind === 'untagged' && onTag) setTagging((v) => !v);
  };
  const boqWord = boq === 'none' ? 'No BOQ yet' : BOQ_TAG_LABEL[boq];
  return (
    <span className="relative inline-flex items-center gap-2 align-middle py-0.5" onClick={(e) => e.stopPropagation()}>
      <span role="button" tabIndex={0} className="pj-stk" style={{ ['--r' as any]: '-3deg' }} data-tip={TAG_TIP[kind]}
        aria-label={`${KIND_LABEL[kind]}. ${TAG_TIP[kind]}`} onClick={tagClick} onKeyDown={keys(tagClick)}>
        <span className={cx('pj-face', kind)}>{KIND_LABEL[kind]}</span><span className="pj-fold" />
      </span>
      <span role="button" tabIndex={0} className="pj-stk seal-w" style={{ ['--r' as any]: '4deg' }} data-tip={BOQ_TIP[boq]}
        aria-label={`${boqWord}. ${BOQ_TIP[boq]}`} onClick={slap} onKeyDown={keys(slap)}>
        <span className={cx('pj-face seal', boq === 'playground' && 'pg')}>{boqWord}</span><span className="pj-fold" />
      </span>
      {tagging && onTag && (
        <span role="menu" className="phd-pop absolute left-0 top-full mt-2 z-20 w-48 bg-white rounded-xl border border-slate-200 shadow-xl p-1.5">
          <span className="block px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Tag this project</span>
          {([[false, 'Actual', 'A real client project'], [true, 'Dummy', 'Test or practice data']] as const).map(([dummy, label, sub]) => (
            <button key={label} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setTagging(false); onTag(dummy); }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50">
              <span className="block text-sm font-semibold text-slate-800">Tag as {label}</span>
              <span className="block text-[11px] text-slate-500">{sub}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** The project's next step as one button: rose when it blocks, gold when it is due, brand otherwise. */
export function NextStepButton({ row, label, onDo, size = 'sm' }: {
  row: JourneyRow;
  /** "Fix it" / "Do it" on the carousel; the step itself in a row. */
  label?: string;
  onDo: (row: JourneyRow) => void;
  size?: 'sm' | 'md';
}) {
  if (!row.next) return <span className="text-[11px] text-slate-500">Nothing pending</span>;
  const tone = row.next.tone;
  return (
    <button type="button" title={row.action?.title}
      onClick={(e) => { e.stopPropagation(); onDo(row); }}
      className={cx(
        buttonClass('primary', size),
        tone === 'red' && '!bg-rose-600 hover:!bg-rose-700',
        tone === 'gold' && '!bg-[#B8923A] hover:!bg-[#a07d2e]',
        'max-w-full',
      )}>
      {tone === 'red' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{label || row.next.label}</span>
    </button>
  );
}

const FACE = ['#3D52A0', '#334155', '#047857', '#B8923A'];
const faceOf = (email: string) => {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FACE[h % FACE.length];
};

/** A designer's initials in a round tile. */
export function Face({ email, name, size = 24 }: { email: string; name: string; size?: number }) {
  return (
    <span title={`Designer ${name}`} className="inline-grid place-items-center rounded-full text-white font-bold shrink-0 border-2 border-white text-[10px]"
      style={{ width: size, height: size, background: faceOf(email) }}>
      {initialsOf(name)}
    </span>
  );
}

export interface MenuItem {
  label?: string;
  /** A small heading instead of an item. */
  heading?: string;
  divider?: boolean;
  dot?: string;
  danger?: boolean;
  /** A ticked choice in a filter list. */
  checked?: boolean;
  onSelect?: () => void;
}

/** The ··· menu, placed under (or above) the button that opened it. */
export function PopMenu({ anchor, items, onClose }: { anchor: DOMRect; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 6 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight, w = el.offsetWidth;
    setPos({
      left: Math.max(10, Math.min(anchor.right - w, window.innerWidth - w - 10)),
      top: anchor.bottom + h + 8 > window.innerHeight ? Math.max(10, anchor.top - h - 6) : anchor.bottom + 6,
    });
    el.querySelector<HTMLElement>('button')?.focus();
  }, [anchor]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="menu" className="pj-overlay phd-pop fixed z-[320] min-w-[210px] max-h-[80vh] overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl p-1.5"
      style={{ left: pos.left, top: pos.top }} onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => it.divider ? (
        <hr key={i} className="my-1 border-slate-100" />
      ) : it.heading ? (
        <p key={i} className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{it.heading}</p>
      ) : (
        <button key={i} type="button" role={it.checked != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.checked} onClick={() => { onClose(); it.onSelect?.(); }}
          className={cx('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold text-left hover:bg-slate-50 focus:bg-slate-50 outline-none',
            it.danger ? 'text-rose-700' : 'text-slate-700')}>
          {it.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: it.dot }} />}
          <span className="flex-1">{it.label}</span>
          {it.checked && <Check className="w-3.5 h-3.5 text-[#3D52A0] shrink-0" aria-label="On" />}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * The three health rings (DESIGN.md "Projects: journey, needs you, one
 * list"): the journey in the stage colour, drawings issued in brand, snags
 * closed in emerald, with "n/n dwg" and the open snags beside them. A ring
 * with nothing to count stays empty; snags show from the first one.
 */
export function HealthRings({ stage, health }: { stage: FolderStage; health: Health }) {
  const { journey, drawings, snags } = health;
  const ring = (r: number, v: number, colour: string) => {
    const c = 2 * Math.PI * r;
    return (
      <g key={r}>
        <circle cx="20" cy="20" r={r} fill="none" stroke={colour} strokeOpacity=".15" strokeWidth="4" />
        <circle className="v" cx="20" cy="20" r={r} fill="none" stroke={colour} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform="rotate(-90 20 20)" />
      </g>
    );
  };
  const openSnags = snags.total - snags.closed;
  const title = [
    journey == null ? 'Closed' : `Journey ${Math.round(journey * 5)}/5`,
    drawings ? `Drawings ${drawings.issued}/${drawings.total} issued` : 'Drawings not counted yet',
    snags.total ? `Snags ${snags.closed}/${snags.total} closed` : 'No snags',
  ].join(' · ');
  return (
    <div className="flex items-center gap-2" title={title} aria-label={title}>
      <svg className="pj-ring3 shrink-0" width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        {ring(17, journey ?? 0, STAGE[stage].color)}
        {ring(11.5, drawings ? share(drawings.issued, drawings.total) : 0, '#3D52A0')}
        {snags.total > 0 && ring(6, share(snags.closed, snags.total), '#047857')}
      </svg>
      <p className="text-[11px] text-slate-500 leading-snug">
        {drawings && drawings.total ? <><span className="tabular-nums">{drawings.issued}/{drawings.total}</span> dwg</> : 'No dwg'}
        <br />
        {snags.total ? <><span className="tabular-nums">{openSnags}</span> snag{openSnags === 1 ? '' : 's'}</> : '—'}
      </p>
    </div>
  );
}

/** When a step is due: "Overdue" in rose, "Today", a day or a date. Nothing when it has no day. */
export function DueLabel({ row, now = Date.now(), className }: { row: Pick<JourneyRow, 'due'>; now?: number; className?: string }) {
  if (!row.due) return null;
  const label = dueLabel(row.due.day, now);
  return <span className={cx('text-[11px] font-semibold', label === 'Overdue' ? 'text-rose-700' : 'text-slate-500', className)}>{label}</span>;
}
