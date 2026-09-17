/*
  One tab control for the whole app.

  There were five treatments across five screens: bordered blue pills on SOF, a
  blue pill beside borderless text on Execution & Ops, underlines on Studio
  Settings, pills with icons on Templates & Bank, underlines again on Platform
  Admin. Each looked deliberate on its own screen and arbitrary beside the others.

  The material is liquid glass: a drifting gradient track that refracts whatever
  sits behind it, a rim that lenses light along its edge, a specular that follows
  the pointer, and a tinted pane that travels between tabs rather than switching.

  Two things about the motion are deliberate rather than decorative. The pane
  deforms in flight — stretching toward its destination and recovering as it
  lands — because a shape that moves rigidly reads as a sprite and one that
  deforms reads as liquid. And the ripple is struck at the pointer's actual
  contact point, not the centre of the tab, because that is where a real surface
  would be disturbed.

  Everything ambient stops under prefers-reduced-motion, leaving a legible
  capsule with no animation at all.
*/

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Optional leading icon — a lucide component, or anything rendering an svg. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Shown as a badge. Zero and undefined both render nothing. */
  count?: number;
  /** Draws the eye without spending the accent — for "3 need you" counts. */
  tone?: 'default' | 'attention';
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** `sm` for dense screens inside a card; `md` for page-level tabs. */
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  /** Degrees of tilt toward the pointer. 0 disables it. */
  tilt?: number;
}

const GLIDE = 'cubic-bezier(.32,.72,0,1)';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const Tabs: React.FC<TabsProps> = ({
  items, value, onChange, size = 'md', ariaLabel, className, tilt = 5,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLSpanElement | null>(null);
  const wakeRef = useRef<HTMLSpanElement | null>(null);
  /** Where the pane currently sits, so travel knows where it is coming from. */
  const atRef = useRef<number>(0);
  /*
    The travel animation runs with `fill: forwards`, which outranks inline
    styles for as long as it is held. Repositioning after a resize therefore
    has to cancel it first, or the pane stays pinned to the pixel offset it
    was given before the layout moved.
  */
  const flightRef = useRef<Animation | null>(null);

  const activeEl = useCallback((): HTMLElement | null => {
    const host = hostRef.current;
    if (!host) return null;
    return host.querySelector<HTMLElement>('[aria-selected="true"]');
  }, []);

  /** Put the pane under a tab with no animation — first paint, resize, font load. */
  const place = useCallback(() => {
    const host = hostRef.current, pane = paneRef.current, btn = activeEl();
    if (!host || !pane || !btn) return;
    flightRef.current?.cancel();
    flightRef.current = null;
    const hb = host.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const x = b.left - hb.left;
    pane.style.width = `${b.width}px`;
    pane.style.transform = `translateX(${x}px) translateZ(14px)`;
    atRef.current = x;
  }, [activeEl]);

  useLayoutEffect(() => { place(); }, [place, items.length]);

  useEffect(() => {
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    // Web fonts land after first paint and change every tab's width.
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) fonts.ready.then(() => place()).catch(() => {});
    return () => window.removeEventListener('resize', onResize);
  }, [place]);

  /*
    The pane travels rather than jumps.

    Mid-flight it elongates toward its destination and thins a little, then
    recovers on arrival — surface tension catching up with the body of water.
    The stretch is scaled by distance, so a hop to the neighbouring tab barely
    deforms while a jump across the row visibly pulls.
  */
  const travel = useCallback((btn: HTMLElement) => {
    const host = hostRef.current, pane = paneRef.current;
    if (!host || !pane) return;

    const hb = host.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const from = atRef.current;
    const to = b.left - hb.left;
    const fromW = parseFloat(pane.style.width) || b.width;
    const dist = Math.abs(to - from);
    const pull = Math.min(0.34, (dist / Math.max(1, hb.width)) * 0.8);
    const dur = 460 + Math.min(260, dist * 0.7);

    pane.style.width = `${b.width}px`;
    atRef.current = to;

    // Width snaps; the scale carries the deformation, so the ends stay put.
    const wRatio = fromW / b.width;
    flightRef.current?.cancel();
    flightRef.current = pane.animate([
      { transform: `translateX(${from}px) translateZ(14px) scaleX(${wRatio}) scaleY(1)` },
      {
        transform: `translateX(${(from + to) / 2}px) translateZ(14px) scaleX(${(wRatio + 1) / 2 + pull}) scaleY(${1 - pull * 0.3})`,
        offset: 0.48,
      },
      { transform: `translateX(${to}px) translateZ(14px) scaleX(1) scaleY(1)` },
    ], { duration: dur, easing: GLIDE, fill: 'forwards' });

    // the crest running across in the direction of travel
    const wake = wakeRef.current;
    if (wake && from !== to) {
      const w = hb.width;
      const forward = to > from;
      const start = forward ? from - w * 0.3 : from + w * 0.1;
      const end = forward ? to + w * 0.1 : to - w * 0.3;
      wake.animate([
        { transform: `translateX(${start}px)`, opacity: 0 },
        { transform: `translateX(${(start + end) / 2}px)`, opacity: 0.85, offset: 0.42 },
        { transform: `translateX(${end}px)`, opacity: 0 },
      ], { duration: dur * 1.15, easing: GLIDE });
    }
  }, []);

  /** A ring struck where the pointer actually landed. */
  const ripple = useCallback((e: React.MouseEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const hb = host.getBoundingClientRect();
    const size = Math.max(hb.width, hb.height) * 0.9;

    const el = document.createElement('span');
    el.className = 'lgt-ripple';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${e.clientX - hb.left}px`;
    el.style.top = `${e.clientY - hb.top}px`;
    host.appendChild(el);

    const anim = el.animate([
      { transform: 'translate(-50%, -50%) scale(0)', opacity: 0.8 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
    ], { duration: 720, easing: 'cubic-bezier(.22,.61,.36,1)' });
    anim.finished.then(() => el.remove()).catch(() => el.remove());
  }, []);

  const handleClick = (e: React.MouseEvent, item: TabItem) => {
    const btn = e.currentTarget as HTMLElement;
    if (item.id !== value && !prefersReducedMotion()) {
      travel(btn);
      ripple(e);
    }
    onChange(item.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const host = hostRef.current;
    if (!host || !tilt || prefersReducedMotion()) return;
    const r = host.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    host.style.setProperty('--mx', `${px * 100}%`);
    host.style.setProperty('--my', `${py * 100}%`);
    host.style.setProperty('--ry', `${((px - 0.5) * 2 * tilt).toFixed(2)}deg`);
    host.style.setProperty('--rx', `${((0.5 - py) * 2 * tilt * 0.55).toFixed(2)}deg`);
  };

  const onPointerLeave = () => {
    const host = hostRef.current;
    if (!host) return;
    host.style.setProperty('--rx', '0deg');
    host.style.setProperty('--ry', '0deg');
    host.style.setProperty('--mx', '50%');
    host.style.setProperty('--my', '50%');
  };

  return (
    <div className={`lgt-scene inline-block max-w-full ${className || ''}`}>
      <div
        ref={hostRef}
        role="tablist"
        aria-label={ariaLabel}
        className="lgt"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <span className="lgt-caustic" aria-hidden="true" />
        <span className="lgt-wake" ref={wakeRef} aria-hidden="true" />
        <span className="lgt-pane" ref={paneRef} aria-hidden="true" />

        {items.map((t) => {
          const active = t.id === value;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={(e) => handleClick(e, t)}
              className={`lgt-tab ${size === 'sm' ? 'lgt-sm' : 'lgt-md'}`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{t.label}</span>
              {!!t.count && t.count > 0 && (
                <span className={`lgt-count ${t.tone === 'attention' && !active ? 'lgt-count-attention' : ''}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Tabs;
