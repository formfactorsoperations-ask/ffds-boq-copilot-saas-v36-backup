import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, type MotionValue, useTransform } from 'framer-motion';
import { Heart } from '@/lib/lucide-shim';
import type { GuideEntry } from '../../../lib/peopleGuide';
import type { Story } from '../../../lib/studioStories';
import { initials } from '../../people/PeopleBits';
import { TINT } from './storyStyles';

/*
  THE COLLECTIBLE CARD (DESIGN.md → "Studio stories"): every thank-you,
  birthday and work anniversary is a card. Small and turned a little in the
  row on Home; full size in the viewer, where it tilts towards the pointer,
  its foil catches the light, and a tap turns it over to the note or the wishes.
*/

const KIND = { kudos: 'Kudos', birthday: 'Birthday', anniversary: 'Anniversary' } as const;
const shortDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const longDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** What the front of a card says: the label at its head, the face, the chip and the line at its foot. */
function faceOf(s: Story, person: string) {
  if (s.kind === 'kudos') return { chip: s.kudos!.tag, face: initials(person) };
  if (s.kind === 'birthday') return { chip: 'Happy birthday', face: initials(person) };
  const n = s.card?.years || 0;
  return { chip: `${n} year${n === 1 ? '' : 's'} with the studio`, face: String(n) };
}

/** The small card in a story's tile on Home. */
export const MiniCard: React.FC<{ story: Story; person: string }> = ({ story, person }) => {
  const t = TINT[story.kind];
  const f = faceOf(story, person);
  return (
    <span className="ss-mini ss-sheen absolute left-1/2 top-1/2 -ml-10 -mt-14 w-20 h-28 rounded-[10px] border bg-white flex flex-col items-center gap-1.5 px-1.5 py-2 shadow-[0_8px_16px_-10px_rgba(30,42,90,.35)]"
      style={{ borderColor: t.bd, color: t.fg }}>
      <span className="text-[10px] font-bold uppercase tracking-wider">{KIND[story.kind]}</span>
      <span className="w-10 h-10 rounded-full border grid place-items-center text-sm font-bold" style={{ background: t.bg, borderColor: t.bd }}>{f.face}</span>
      <span className="max-w-full truncate rounded-full px-1.5 text-[10px] font-bold" style={{ background: t.bg }}>{story.kind === 'kudos' ? f.chip : story.kind === 'birthday' ? 'Birthday' : 'Years'}</span>
    </span>
  );
};

/** The full card in the viewer. `tiltX` and `tiltY` run from -1 to 1. */
export const CollectibleCard: React.FC<{
  story: Story;
  person: string;
  from?: string;
  entry?: GuideEntry;
  flipped: boolean;
  onFlip: () => void;
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
}> = ({ story, person, from, entry, flipped, onFlip, tiltX, tiltY }) => {
  const still = useReducedMotion();
  const t = TINT[story.kind];
  const f = faceOf(story, person);
  const rotateY = useTransform(tiltX, (v: number) => (still ? 0 : v * 16));
  const rotateX = useTransform(tiltY, (v: number) => (still ? 0 : -v * 12));
  const px = useTransform(tiltX, (v: number) => `${50 + v * 50}%`);
  const py = useTransform(tiltY, (v: number) => `${50 + v * 50}%`);
  const gx = useTransform(tiltX, (v: number) => `${50 + v * 45}%`);
  const gy = useTransform(tiltY, (v: number) => `${40 + v * 45}%`);

  /* An anniversary counts its years up as the card lands. */
  const years = story.card?.years || 0;
  const [count, setCount] = useState(story.kind === 'anniversary' && !still ? 0 : years);
  useEffect(() => {
    if (story.kind !== 'anniversary' || still) return;
    setCount(0);
    let k = 0;
    const it = window.setInterval(() => { k += 1; setCount(k); if (k >= years) window.clearInterval(it); }, 260);
    return () => window.clearInterval(it);
  }, [story.id]);

  const wishes = story.card?.wishes || [];
  const foot = story.kind === 'kudos'
    ? <><span className="truncate">from {from}</span><span className="inline-flex items-center gap-1 shrink-0"><Heart className="w-3 h-3" />{story.kudos!.hearts.length}</span></>
    : story.kind === 'birthday'
      ? <><span>{wishes.length} signed</span><span>{story.at.slice(0, 4)}</span></>
      : <><span className="truncate">{entry?.joinedOn ? `Joined ${longDate(entry.joinedOn)}` : 'With the studio'}</span><span className="shrink-0">Thank you</span></>;

  return (
    <div className="ss-deal w-[min(62%,250px)] aspect-[5/7]" style={{ perspective: 1100 }}>
      <motion.div className="ss-3d w-full h-full" style={{ rotateX, rotateY }}>
        <button type="button" onClick={onFlip} aria-pressed={flipped}
          aria-label={flipped ? 'Turn the card back over' : story.kind === 'kudos' ? 'Turn the card over to read the note' : 'Turn the card over to read the wishes'}
          className={`ss-flip block text-left cursor-pointer ${flipped ? 'is-flipped' : ''}`}>
          <motion.span className="ss-face ss-sheen rounded-[18px] border flex flex-col p-3.5 text-slate-800 shadow-[0_22px_44px_-24px_rgba(30,42,90,.45)]"
            style={{ borderColor: t.bd, background: `linear-gradient(170deg, ${t.bg} 0%, #FFFFFF 68%)`, '--ss-px': px, '--ss-py': py, '--ss-gx': gx, '--ss-gy': gy } as any}>
            <span className="ss-foil" aria-hidden />
            <span className="ss-glare" aria-hidden />
            <span className="relative z-[1] flex flex-col h-full">
            <span className="flex justify-between text-[10px] font-bold uppercase tracking-wider" style={{ color: t.fg }}>
              <span>{KIND[story.kind]}</span>
              <span>{story.kind === 'anniversary' && entry?.joinedOn ? `Since ${entry.joinedOn.slice(0, 4)}` : shortDate(story.at)}</span>
            </span>
            <span className={`mx-auto mt-auto mb-2.5 w-[44%] aspect-square rounded-full border-2 bg-white grid place-items-center font-bold tabular-nums ${story.kind === 'anniversary' ? 'text-4xl' : 'text-2xl'}`}
              style={{ color: t.fg, borderColor: t.bd }}>
              {story.kind === 'anniversary' ? count : f.face}
            </span>
            <span className="text-center font-bold text-slate-800">{person}</span>
            <span className="self-center mt-1.5 mb-auto max-w-full truncate px-2.5 py-0.5 rounded-full text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>{f.chip}</span>
            <span className="flex justify-between gap-2 text-[11px] text-slate-500">{foot}</span>
            </span>
          </motion.span>
          <span className="ss-face ss-back rounded-[18px] border bg-white p-4 flex flex-col gap-2 text-slate-800 overflow-hidden" style={{ borderColor: t.bd }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.fg }}>{story.kind === 'kudos' ? 'The note' : 'On the card'}</span>
            {story.kind === 'kudos' ? (
              <>
                <span className="text-sm leading-relaxed whitespace-pre-line">“{story.kudos!.text}”</span>
                <span className="mt-auto text-[11px] text-slate-500">{from} · {shortDate(story.at)}</span>
              </>
            ) : wishes.length ? (
              <>
                <span className="grid gap-1.5">
                  {wishes.slice(-4).reverse().map((w) => (
                    <span key={w.by} className="rounded-lg px-2 py-1 text-xs text-slate-600 line-clamp-2" style={{ background: t.bg }}>“{w.text}” · {w.name.split(/\s+/)[0]}</span>
                  ))}
                </span>
                {wishes.length > 4 && <span className="mt-auto text-[11px] text-slate-500">and {wishes.length - 4} more</span>}
              </>
            ) : (
              <span className="text-sm text-slate-600">No wishes yet. Be the first to sign.</span>
            )}
          </span>
        </button>
      </motion.div>
    </div>
  );
};
