import React, { useEffect, useRef, useState } from 'react';
import type { ConversationId } from '../../lib/projectConversations';
import type { Stage } from './maquette';
import './conversationsBackdrop.css';

/*
  The 3D stage behind the open conversation (owner, 27 Nov 2026: "3D shapes
  related to the conversation we are on, related to interior and
  architecture practice"). It fills the conversation pane, under the story's
  solid cards:
    - two soft glows in the conversation's tint;
    - the conversation's maquette (./maquette: a room, a doorway, coin
      stacks, sample boards, drawings, a chair, a crane, a staircase, a
      contoured site), which assembles piece by piece when you open the
      conversation, turns gently, leans toward the pointer and moves one part.
  three.js is loaded only when this mounts. Without WebGL only the glows show.
  Decoration only: hidden from assistive tech, never takes a click. Still
  under reduced motion, while a window is open, or when the person pauses it.
*/

/** The tint as r, g, b, for the glows (palette only; maquette TINT is the same). */
const TINT_RGB: Record<ConversationId, string> = {
  whole: '61, 82, 160', chat: '61, 82, 160', money: '245, 158, 11', boq: '61, 82, 160', docs: '61, 82, 160',
  design: '244, 63, 94', site: '245, 158, 11', plan: '61, 82, 160', brief: '16, 185, 129',
};

function reducedMotion() {
  try { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
/* jsdom and very old browsers have no WebGL: draw the glows only. */
const hasWebGL = () => typeof window !== 'undefined' && 'WebGLRenderingContext' in window;

export default function ConversationsBackdrop({ conv, still }: { conv: ConversationId; still: boolean }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<Stage | null>(null);
  const [ready, setReady] = useState(false);
  const quiet = still || reducedMotion();

  /* Load three.js and set the stage up once. */
  useEffect(() => {
    if (!hasWebGL()) return;
    let alive = true;
    let ro: ResizeObserver | null = null;
    import('./maquette').then(({ createStage }) => {
      if (!alive || !canvas.current || !wrap.current) return;
      try { stage.current = createStage(canvas.current); } catch { return; }
      const fit = () => { const r = wrap.current?.getBoundingClientRect(); if (r && stage.current) { stage.current.resize(r.width, r.height); stage.current.frame(performance.now() / 1000, true); } };
      fit();
      if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(fit); ro.observe(wrap.current); }
      setReady(true);
    }).catch(() => { /* no 3D: the glows stay */ });
    return () => { alive = false; ro?.disconnect(); stage.current?.dispose(); stage.current = null; };
  }, []);

  /* The conversation's model; it assembles unless the stage is quiet. */
  useEffect(() => {
    if (!ready || !stage.current) return;
    stage.current.show(conv, !quiet);
    if (quiet) stage.current.frame(performance.now() / 1000, true);
  }, [conv, ready]);

  /* Moving: a frame each animation frame and a lean toward the pointer. Quiet: one still frame. */
  useEffect(() => {
    const s = stage.current;
    if (!ready || !s) return;
    if (quiet) { s.lean(0, 0); s.frame(performance.now() / 1000, true); return; }
    let raf = 0;
    const loop = () => { s.frame(performance.now() / 1000, false); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const onMove = (e: PointerEvent) => s.lean(e.clientX / Math.max(1, window.innerWidth) - 0.5, e.clientY / Math.max(1, window.innerHeight) - 0.5);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
  }, [ready, quiet]);

  return (
    <div className="cvb" aria-hidden data-still={quiet ? '' : undefined} data-testid="conversations-backdrop"
      style={{ '--cvb-tint': TINT_RGB[conv] || TINT_RGB.whole } as React.CSSProperties}>
      <div className="cvb-glow cvb-glow-a" />
      <div className="cvb-glow cvb-glow-b" />
      <div ref={wrap} className="cvb-model"><canvas ref={canvas} /></div>
    </div>
  );
}
