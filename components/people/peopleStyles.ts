/*
  People: the motion kit (DESIGN.md → "People motion").

  Approved by the studio owner on 11 Oct 2026 for People (and, from 12 Oct,
  the Home widgets): richer motion than the console screens, the same type
  and palette. Brand #3D52A0, slate, and rose/amber/emerald for state;
  nothing else. Every animation here stops under prefers-reduced-motion.

  The styles ship inside this module, which adds them to the page once when
  it is first imported (by PeopleBits.tsx). A separate .css file could be
  left behind when the app is copied or synced without it; then every glass
  card, ring track and tile shadow silently disappears, as happened on the
  live app on 12 Oct 2026.
*/
const PEOPLE_CSS = `
/* A glass card over the page: the My day card and the People header panel. */
.pp-glass {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(247, 250, 254, 0.86));
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 24px 60px -28px rgba(61, 82, 160, 0.28);
}
/* A slow brand glow drifting behind the glass. */
.pp-glow {
  position: absolute; inset: -40% -20% auto auto; width: 70%; aspect-ratio: 1; border-radius: 9999px;
  background: radial-gradient(circle, rgba(61, 82, 160, 0.16), transparent 68%);
  filter: blur(18px); pointer-events: none;
  animation: pp-drift 18s ease-in-out infinite;
}
@keyframes pp-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-8%, 10%, 0) scale(1.08); }
}

/* Rings: the working day, and each leave balance, fill from empty. */
.pp-ring-track { stroke: rgba(148, 163, 184, 0.22); }
.pp-ring-fill { transition: stroke-dashoffset 1100ms cubic-bezier(0.22, 1, 0.36, 1); }
.pp-ring-in .pp-ring-fill { animation: pp-ring-fill 1300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes pp-ring-fill { from { stroke-dashoffset: var(--pp-full); } }

/* Checked in: a soft breathing halo round the live dot. */
.pp-live { position: relative; }
.pp-live::after {
  content: ''; position: absolute; inset: -6px; border-radius: 9999px;
  border: 2px solid rgba(16, 185, 129, 0.45);
  animation: pp-breathe 2.4s ease-out infinite;
}
@keyframes pp-breathe {
  0% { transform: scale(0.7); opacity: 0.9; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* Finding the location: radar rings from the pin. */
.pp-radar { position: relative; }
.pp-radar::before, .pp-radar::after {
  content: ''; position: absolute; inset: 0; border-radius: 9999px;
  border: 2px solid rgba(61, 82, 160, 0.5);
  animation: pp-radar 1.6s ease-out infinite;
}
.pp-radar::after { animation-delay: 0.8s; }
@keyframes pp-radar {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2.4); opacity: 0; }
}

/* Done: a ring bursts out and the tick draws itself. */
.pp-burst { position: relative; }
.pp-burst::before {
  content: ''; position: absolute; inset: -4px; border-radius: 9999px;
  border: 3px solid rgba(16, 185, 129, 0.55);
  animation: pp-burst 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes pp-burst {
  0% { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(1.9); opacity: 0; }
}
.pp-tick path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: pp-draw 520ms 120ms ease-out forwards; }
@keyframes pp-draw { to { stroke-dashoffset: 0; } }

/* Loading: a light sweeping across a placeholder. */
.pp-shimmer {
  position: relative; overflow: hidden; background: rgb(241, 245, 249);
}
.pp-shimmer::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.75), transparent);
  transform: translateX(-100%);
  animation: pp-shimmer 1.4s ease-in-out infinite;
}
@keyframes pp-shimmer { to { transform: translateX(100%); } }

/* Hover lift for interactive cards. */
.pp-lift { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease; }
.pp-lift:hover { transform: translateY(-2px); box-shadow: 0 14px 30px -18px rgba(61, 82, 160, 0.35); }

/* The second hand of the live clock. */
.pp-tickover { animation: pp-tickover 1s steps(1) infinite; }
@keyframes pp-tickover { 50% { opacity: 0.35; } }

@media (prefers-reduced-motion: reduce) {
  .pp-glow, .pp-live::after, .pp-radar::before, .pp-radar::after, .pp-burst::before,
  .pp-shimmer::after, .pp-tickover, .pp-ring-in .pp-ring-fill { animation: none !important; }
  .pp-tick path { animation: none !important; stroke-dashoffset: 0; }
  .pp-ring-fill, .pp-lift { transition: none !important; }
  .pp-lift:hover { transform: none; }
}

/* ── Round two (owner, 12 Oct 2026): depth. ─────────────────────────────── */

/* The stage for anything that tilts, flips or orbits. */
.pp-3d { perspective: 1100px; }
.pp-keep { transform-style: preserve-3d; }
.pp-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.pp-flipped { transform: rotateY(180deg); }

/* An icon tile with depth: lifts and turns towards the pointer's side on hover. */
.pp-tile {
  position: relative; display: grid; place-items: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 8px 16px -10px currentColor;
  transform: perspective(500px) translateZ(0);
  transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 300ms ease;
}
.group:hover .pp-tile, .pp-tile:hover {
  transform: perspective(500px) rotateY(-16deg) rotateX(10deg) translateZ(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75), 6px 12px 18px -10px currentColor;
}

/* A button with depth that sinks when pressed, and a light that sweeps it now and then. */
.pp-press {
  position: relative; overflow: hidden;
  box-shadow: 0 4px 0 #334486, 0 16px 26px -14px rgba(61, 82, 160, 0.7);
  transition: transform 120ms ease, box-shadow 120ms ease, background-color 150ms ease;
}
.pp-press:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #334486, 0 8px 14px -10px rgba(61, 82, 160, 0.7); }
.pp-press::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.35) 48%, transparent 66%);
  transform: translateX(-120%);
  animation: pp-sweep 4.5s ease-in-out 1.2s infinite;
}
@keyframes pp-sweep { 0%, 70% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }

/* Studio off days on the calendar: a quiet hatch. */
.pp-hatch { background-image: repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.14) 0 6px, transparent 6px 12px); }

/* Today on the calendar: a brand ring that breathes. */
.pp-today { position: relative; }
.pp-today::after {
  content: ''; position: absolute; inset: -2px; border-radius: inherit; pointer-events: none;
  border: 2px solid rgba(61, 82, 160, 0.55);
  animation: pp-today 2.8s ease-in-out infinite;
}
@keyframes pp-today { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 1; transform: scale(1.015); } }

/* Who's in: faces orbiting a tilted ring, always turned to the viewer. */
.pp-orbit { position: absolute; inset: 0; transform-style: preserve-3d; animation: pp-orbit 26s linear infinite; }
.pp-orbit-slot { position: absolute; left: 50%; top: 50%; transform-style: preserve-3d; }
.pp-orbit-face { animation: pp-orbit-face 26s linear infinite; }
@keyframes pp-orbit { from { transform: rotateX(66deg) rotateZ(0deg); } to { transform: rotateX(66deg) rotateZ(360deg); } }
@keyframes pp-orbit-face { from { transform: rotateZ(0deg) rotateX(-66deg); } to { transform: rotateZ(-360deg) rotateX(-66deg); } }
.pp-orbit-track { position: absolute; inset: 0; border-radius: 9999px; border: 1.5px dashed rgba(61, 82, 160, 0.25); }

/* An icon that swings like a door opening (someone just arrived). */
.pp-door { transform-origin: 30% 50%; animation: pp-door 1.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes pp-door { 0% { transform: perspective(200px) rotateY(0); } 35% { transform: perspective(200px) rotateY(-55deg); } 70% { transform: perspective(200px) rotateY(-30deg); } 100% { transform: perspective(200px) rotateY(0); } }

/* A soft float, for the empty states' icons. */
.pp-float { animation: pp-float 5s ease-in-out infinite; }
@keyframes pp-float { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-5px) rotate(-3deg); } }

@media (prefers-reduced-motion: reduce) {
  .pp-tile, .pp-press { transition: none !important; }
  .group:hover .pp-tile, .pp-tile:hover { transform: none; }
  .pp-press::after, .pp-today::after, .pp-orbit, .pp-orbit-face, .pp-door, .pp-float { animation: none !important; }
  .pp-orbit { transform: rotateX(66deg); }
  .pp-orbit-face { transform: rotateX(-66deg); }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('pp-styles')) {
  const style = document.createElement('style');
  style.id = 'pp-styles';
  style.textContent = PEOPLE_CSS;
  document.head.appendChild(style);
}

export {};
