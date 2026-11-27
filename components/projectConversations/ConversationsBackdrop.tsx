import React, { useEffect, useRef } from 'react';
import type { ConversationId } from '../../lib/projectConversations';
import './conversationsBackdrop.css';

/*
  The 3D backdrop behind the Conversations workspace (owner, 27 Nov 2026).
  It shows through the glass panes:
    - soft glows that drift and take the tint of the conversation that is open;
    - a grid floor rolling toward you;
    - glass cubes turning, a gyroscope of three rings, shiny orbs bobbing;
    - the whole scene leans toward the pointer, and swings when you pick a
      conversation.
  Decoration only: hidden from assistive tech, never takes a click. Still
  under reduced motion, when the person pauses it, or under a window.
*/

/** Palette only: brand blue, emerald, amber, rose, slate (as r, g, b). */
const TINT: Record<ConversationId, string> = {
  whole: '61, 82, 160', chat: '61, 82, 160', money: '16, 185, 129', boq: '61, 82, 160', docs: '100, 116, 139',
  design: '244, 63, 94', site: '245, 158, 11', plan: '61, 82, 160', brief: '16, 185, 129',
};

const BRAND = '61, 82, 160';
const AMBER = '245, 158, 11';
const EMERALD = '16, 185, 129';
const ROSE = '244, 63, 94';

const css = (v: Record<string, string>) => v as React.CSSProperties;

function reducedMotion() {
  try { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export default function ConversationsBackdrop({ conv, still }: { conv: ConversationId; still: boolean }) {
  const tilt = useRef<HTMLDivElement | null>(null);
  const kick = useRef<HTMLDivElement | null>(null);

  /* Lean toward the pointer, a few degrees at most, once a frame. */
  useEffect(() => {
    if (still || reducedMotion()) { tilt.current?.style.setProperty('--cvb-tx', '0deg'); tilt.current?.style.setProperty('--cvb-ty', '0deg'); return; }
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX / Math.max(1, window.innerWidth) - 0.5;
      y = e.clientY / Math.max(1, window.innerHeight) - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tilt.current?.style.setProperty('--cvb-tx', `${(x * 10).toFixed(2)}deg`);
        tilt.current?.style.setProperty('--cvb-ty', `${(-y * 7).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, [still]);

  /* Picking a conversation swings the scene round and back. */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = kick.current;
    if (!el || still || reducedMotion() || typeof el.animate !== 'function') return;
    el.animate(
      [{ transform: 'rotateY(0deg) translateZ(0)' }, { transform: 'rotateY(18deg) translateZ(-60px)' }, { transform: 'rotateY(-4deg) translateZ(0)' }, { transform: 'rotateY(0deg)' }],
      { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [conv, still]);

  return (
    <div className="cvb" aria-hidden data-still={still ? '' : undefined} data-testid="conversations-backdrop"
      style={css({ '--cvb-tint': TINT[conv] || BRAND })}>
      <div className="cvb-glow cvb-glow-a" />
      <div className="cvb-glow cvb-glow-b" />
      <div className="cvb-glow cvb-glow-c" />
      <div className="cvb-stage">
        <div ref={tilt} className="cvb-tilt">
          <div ref={kick} className="cvb-kick">
            <div className="cvb-floor" />
            <div className="cvb-obj cvb-cube" style={css({ '--s': '130px', '--c': BRAND, '--d': '28s', right: '25%', top: '60%' })}><i /><i /><i /><i /><i /><i /></div>
            <div className="cvb-obj cvb-cube" style={css({ '--s': '64px', '--c': AMBER, '--d': '19s', left: '4%', bottom: '14%' })}><i /><i /><i /><i /><i /><i /></div>
            <div className="cvb-obj cvb-cube" style={css({ '--s': '44px', '--c': ROSE, '--d': '15s', left: '46%', top: '6%' })}><i /><i /><i /><i /><i /><i /></div>
            <div className="cvb-obj cvb-gyro" style={css({ '--s': '300px', left: '33%', top: '50%' })}><i /><i /><i /></div>
            <div className="cvb-obj cvb-orb" style={css({ '--s': '54px', '--c': BRAND, '--d': '7s', left: '22%', top: '14%' })} />
            <div className="cvb-obj cvb-orb" style={css({ '--s': '34px', '--c': EMERALD, '--d': '9s', '--delay': '-3s', right: '24%', bottom: '18%' })} />
            <div className="cvb-obj cvb-orb" style={css({ '--s': '26px', '--c': AMBER, '--d': '6s', '--delay': '-1.5s', right: '40%', top: '18%' })} />
          </div>
        </div>
      </div>
    </div>
  );
}
