import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnimationFrame, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ChevronLeft, ChevronRight, Heart, Pause, Play, X } from '@/lib/lucide-shim';
import type { GuideView } from '../../../lib/peopleGuide';
import { firstName, storyWhen, storyWords, type Story, type StoryGroup } from '../../../lib/studioStories';
import { runGuide } from '../../../services/peopleGuideService';
import { Button } from '../../ui/kit';
import { Confetti, initials } from '../../people/PeopleBits';
import { CollectibleCard } from './StoryCard';
import { StoryTile } from './StoryTile';
import { TINT } from './storyStyles';

/*
  A STORY, FULL SCREEN (DESIGN.md → "Studio stories"), like Facebook's:
  bars along the top fill as each story plays and move on by themselves; tap
  the right side for the next and the left for the one before, hold to pause;
  the arrows (and the arrow keys) go to the next or previous person, whose
  stories wait dimmed at either side on a wide screen. The collectible card
  deals in under confetti, tilts towards the pointer and turns over when
  tapped. A thank-you takes a heart; a birthday or anniversary card takes a
  wish. A story counts as watched once it has been on screen.

  The groups are held as they were when the viewer opened, so watching one
  does not move the others about; what each says (hearts, wishes) is read live.
*/

const DUR = 6500;

export default function StoryViewer({ groups, start, view, meId, onSeen, onClose, onOpenPeople }: {
  groups: StoryGroup[];
  start: number;
  view: GuideView;
  meId: string;
  onSeen: (id: string) => void;
  onClose: () => void;
  onOpenPeople: (section: 'kudos' | 'celebrations') => void;
}) {
  const still = useReducedMotion();
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => groups[start]?.start || 0);
  const [moved, setMoved] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ n: number; text: string } | null>(null);
  const [burst, setBurst] = useState(0);
  const [floats, setFloats] = useState<{ id: number; dx: number; delay: number }[]>([]);
  const bar = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);
  const holding = useRef(false);
  const hover = useRef(false);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const sx = useSpring(tiltX, { stiffness: 150, damping: 18 });
  const sy = useSpring(tiltY, { stiffness: 150, damping: 18 });

  const g = groups[gi];
  const base = g.stories[Math.min(si, g.stories.length - 1)];
  /* Hearts and wishes as they are now. */
  const story: Story = useMemo(() => {
    if (base.kind === 'kudos') { const k = view.kudos.find((x) => x.id === base.id); return k ? { ...base, kudos: k } : base; }
    const c = view.cards.find((x) => x.id === base.id);
    return c ? { ...base, card: c } : base;
  }, [base, view]);
  const nameOf = (id: string) => view.entries.find((e) => e.id === id)?.name || 'Someone';
  const words = storyWords(story, nameOf, meId);
  const t = TINT[story.kind];

  /* On screen: watched. A new story starts from the front, under confetti. */
  useEffect(() => {
    onSeen(story.id);
    progress.current = 0;
    setFlipped(false);
    setWish('');
    setError('');
    setBurst((b) => b + 1);
  }, [story.id]);

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, []);

  const go = (toGroup: number, toStory: number) => { setMoved(true); setGi(toGroup); setSi(toStory); };
  const step = (dir: 1 | -1) => {
    if (dir > 0) {
      if (si < g.stories.length - 1) go(gi, si + 1);
      else if (gi < groups.length - 1) go(gi + 1, groups[gi + 1].start);
      else onClose();
    } else if (si > 0) go(gi, si - 1);
    else if (gi > 0) go(gi - 1, 0);
    else progress.current = 0;
  };
  const jump = (dir: 1 | -1) => {
    const n = gi + dir;
    if (n < 0) return;
    if (n >= groups.length) onClose();
    else go(n, groups[n].start);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') stepRef.current(1);
      else if (e.key === 'ArrowLeft') stepRef.current(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  /* The bar fills while the story plays; the card sways a little when the pointer is away. */
  useAnimationFrame((time, delta) => {
    if (!paused && !holding.current) {
      progress.current += Math.min(delta, 100) / DUR;
      if (progress.current >= 1) { progress.current = 0; stepRef.current(1); }
    }
    if (bar.current) bar.current.style.width = `${Math.min(100, progress.current * 100)}%`;
    if (!hover.current && !still) { tiltX.set(Math.sin(time / 1250) * 0.4); tiltY.set(Math.cos(time / 1650) * 0.25); }
  });

  const pointAt = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    hover.current = true;
    tiltX.set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)));
    tiltY.set(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
  };

  const say = (text: string) => setToast({ n: Date.now(), text });
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2300); return () => window.clearTimeout(id); }, [toast?.n]);

  const hearted = !!meId && !!story.kudos?.hearts.includes(meId);
  const heart = async () => {
    if (!story.kudos || busy) return;
    if (!hearted && !still) {
      const now = Date.now();
      setFloats((f) => [...f, ...[0, 1, 2, 3, 4].map((k) => ({ id: now + k, dx: Math.round(Math.random() * 70 - 35), delay: k * 110 }))]);
      window.setTimeout(() => setFloats((f) => f.filter((x) => x.id < now)), 2400);
    }
    setBusy(true);
    setError('');
    const r = await runGuide('heart', { kudosId: story.id, on: !hearted });
    setBusy(false);
    if (r.ok === false) setError(r.error);
  };
  const sign = async () => {
    const text = wish.trim();
    if (!text || busy || !story.card) return;
    setBusy(true);
    setError('');
    const r = await runGuide('wish', { cardId: story.id, text });
    setBusy(false);
    if (r.ok === false) { setError(r.error); return; }
    setWish('');
    (document.activeElement as HTMLElement | null)?.blur();
    holding.current = false;
    say('Your wish is on the card');
    setBurst((b) => b + 1);
  };
  const open = (section: 'kudos' | 'celebrations') => { onClose(); onOpenPeople(section); };

  /* Tap a side for the next or previous story; hold anywhere on it to pause. */
  const zone = (dir: 1 | -1) => {
    let downAt = 0;
    return {
      onPointerDown: () => { downAt = Date.now(); holding.current = true; },
      onPointerUp: () => { holding.current = false; if (downAt && Date.now() - downAt < 250) step(dir); downAt = 0; },
      onPointerLeave: () => { if (downAt) holding.current = false; downAt = 0; },
    };
  };

  const card = story.card;
  const foot = story.kind === 'kudos' ? (
    <>
      <span className="relative">
        <button type="button" onClick={heart} disabled={busy} aria-pressed={hearted} aria-label={hearted ? 'Take your heart back' : 'Add a heart'}
          className={`h-10 px-3.5 rounded-full border bg-white inline-flex items-center gap-1.5 text-sm font-bold tabular-nums transition-transform hover:scale-105 disabled:opacity-60 ${hearted ? 'border-rose-200 text-rose-600' : 'border-slate-300 text-slate-600 hover:text-rose-600'}`}>
          <Heart className="w-4 h-4" fill={hearted ? 'currentColor' : 'none'} />{story.kudos!.hearts.length}
        </button>
        {floats.map((f) => (
          <span key={f.id} aria-hidden className="ss-float pointer-events-none absolute left-3 -top-2 text-rose-500"
            style={{ '--ss-dx': `${f.dx}px`, animationDelay: `${f.delay}ms` } as any}>
            <Heart className="w-6 h-6" fill="currentColor" />
          </span>
        ))}
      </span>
      <Button variant={story.personId === meId ? 'primary' : 'secondary'} className="flex-1" onClick={() => open('kudos')}>
        {story.personId === meId ? 'Say thank you back' : 'See the kudos wall'}
      </Button>
    </>
  ) : card?.mine ? (
    <Button variant="primary" className="flex-1" onClick={() => open('celebrations')}>Open your card</Button>
  ) : card?.signed ? (
    <>
      <span className="flex-1 text-xs font-semibold text-slate-500">You have signed the card</span>
      <Button onClick={() => open('celebrations')}>See the card</Button>
    </>
  ) : (
    <form className="flex-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); sign(); }}>
      <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={280} aria-label={`Write a wish for ${firstName(g.name)}`}
        placeholder={`Write a wish for ${firstName(g.name)}`}
        onFocus={() => { holding.current = true; }} onBlur={() => { holding.current = false; }}
        className="flex-1 min-w-0 h-10 px-3.5 rounded-full border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
      <Button type="submit" variant="primary" disabled={busy || !wish.trim()}>Sign</Button>
    </form>
  );

  const side = (dir: 1 | -1) => {
    const k = gi + dir;
    const sg = groups[k];
    return (
      <button type="button" onClick={() => jump(dir)} tabIndex={-1} aria-hidden
        className={`hidden lg:block w-[150px] h-[266px] shrink-0 transition-all duration-200 opacity-50 scale-95 hover:opacity-90 hover:scale-100 ${sg ? '' : 'invisible'}`}>
        {sg && <StoryTile group={sg} nameOf={nameOf} side />}
      </button>
    );
  };

  return createPortal(
    <div className="ss-in fixed inset-0 z-[300] grid place-items-center" role="dialog" aria-modal="true" aria-label="Studio stories">
      <div className="absolute inset-0 bg-[#F4F6FB]/85 backdrop-blur-xl" onClick={onClose} />
      <div className="relative flex items-center gap-7">
        {side(-1)}
        <button type="button" onClick={() => jump(-1)} disabled={gi === 0} aria-label="Previous person"
          className="hidden sm:grid w-11 h-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-[#3D52A0] hover:border-[#3D52A0]/40 disabled:opacity-30">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <section key={story.id} onPointerMove={pointAt} onPointerLeave={() => { hover.current = false; }}
          className={`${moved ? 'ss-swap' : 'ss-frame'} relative flex flex-col overflow-hidden w-screen h-[100dvh] px-3.5 sm:w-auto sm:h-[min(calc(100dvh-48px),720px)] sm:aspect-[9/16] sm:max-w-[calc(100vw-32px)] sm:rounded-[22px] sm:border sm:border-slate-200 shadow-[0_30px_70px_-30px_rgba(30,42,90,.45)]`}
          style={{ background: `linear-gradient(180deg, ${t.bg} 0%, #FFFFFF 72%)`, paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}>
          <div className="relative z-[3] flex gap-1" aria-hidden>
            {g.stories.map((s, k) => (
              <span key={s.id} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: t.bd }}>
                <span ref={k === si ? bar : undefined} className="block h-full rounded-full" style={{ background: t.fg, width: k < si ? '100%' : '0%' }} />
              </span>
            ))}
          </div>

          <div className="relative z-[3] mt-2.5 flex items-center gap-2.5">
            <span className="ss-ring w-9 h-9 rounded-full p-[2px] shrink-0">
              <span className="w-full h-full rounded-full border-2 border-white grid place-items-center text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>{initials(g.name)}</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{g.mine ? 'You' : g.name}</p>
              <p className="text-[11px] font-semibold text-slate-500">{storyWhen(story)}</p>
            </div>
            <div className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}
                className="w-8 h-8 grid place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-[#3D52A0]">
                {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
              <button type="button" onClick={onClose} aria-label="Close"
                className="w-8 h-8 grid place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-[#3D52A0]">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button type="button" aria-label="Previous story" className="absolute left-0 top-16 bottom-20 w-[30%] z-[1] cursor-pointer" {...zone(-1)} />
          <button type="button" aria-label="Next story" className="absolute right-0 top-16 bottom-20 w-[30%] z-[1] cursor-pointer" {...zone(1)} />

          <div className="relative z-[2] flex-1 min-h-0 flex flex-col items-center justify-center gap-3.5 pointer-events-none">
            <div className="pointer-events-auto w-full flex justify-center">
              <CollectibleCard story={story} person={g.name} from={story.kudos ? nameOf(story.kudos.from) : undefined}
                entry={view.entries.find((e) => e.id === story.personId)}
                flipped={flipped} onFlip={() => { setFlipped((f) => !f); setPaused(true); }} tiltX={sx} tiltY={sy} />
            </div>
            <span key={burst} className="absolute left-1/2 top-[38%] w-0 h-0" aria-hidden>
              <Confetti pieces={story.kind === 'kudos' ? 18 : 26} spread={150} delay={0.5} />
            </span>
            <p className="ss-rise text-center max-w-[32ch] text-sm text-slate-600 pointer-events-auto">
              <span className="block font-bold text-slate-800">{words.title}</span>
              <span className="line-clamp-2">{story.kind === 'kudos' ? story.kudos!.tag : words.line}</span>
            </p>
            <span className="text-[11px] text-slate-400">Tap the card to turn it over</span>
          </div>

          {error && <p className="relative z-[4] mb-2 text-xs font-semibold text-rose-600 text-center" role="alert">{error}</p>}
          <div className="relative z-[4] flex items-center gap-2">{foot}</div>

          {toast && (
            <span key={toast.n} role="status" className="ss-toast absolute left-1/2 bottom-20 z-[6] px-3 py-1.5 rounded-full bg-slate-800 text-white text-xs font-bold whitespace-nowrap">
              {toast.text}
            </span>
          )}
        </section>

        <button type="button" onClick={() => jump(1)} aria-label="Next person"
          className="hidden sm:grid w-11 h-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-[#3D52A0] hover:border-[#3D52A0]/40">
          <ChevronRight className="w-5 h-5" />
        </button>
        {side(1)}
      </div>
    </div>,
    document.body,
  );
}
