/*
  Notifications: the motion kit (DESIGN.md → "Notifications motion").

  Approved by the studio owner on 22 Oct 2026: the bell, the badges on the
  tabs and the glass "needs you" bar appear on every screen, with the People
  kit's depth (glass, 3D turns, coins) and the same type and palette. Brand
  #3D52A0, slate, and rose/amber/emerald for state; nothing else. Every
  animation here stops under prefers-reduced-motion.

  The styles ship inside this module and are added to the page once, when it
  is first imported, for the reason peopleStyles.ts gives: a separate .css
  file can be left behind when the app is copied or synced.
*/
const NOTIFY_CSS = `
/* The "needs you" bar: frosted glass over whatever is on screen. */
.nt-glass {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(229, 235, 252, 0.72) 55%, rgba(238, 234, 246, 0.78));
  backdrop-filter: blur(24px) saturate(1.7);
  -webkit-backdrop-filter: blur(24px) saturate(1.7);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.95) inset,
    0 -1px 0 rgba(61, 82, 160, 0.06) inset,
    0 0 0 1px rgba(61, 82, 160, 0.08),
    0 34px 70px -26px rgba(18, 24, 47, 0.5);
}
/* A light that passes across the glass now and then. */
.nt-sheen { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
.nt-sheen::before {
  content: ""; position: absolute; top: 0; bottom: 0; width: 40%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  transform: translateX(-140%) skewX(-12deg);
  animation: nt-sheen 6s ease-in-out 0.6s infinite;
}
@keyframes nt-sheen { 0%, 70% { transform: translateX(-140%) skewX(-12deg); } 100% { transform: translateX(320%) skewX(-12deg); } }
/* Brand glows drifting behind the glass. */
.nt-orb { position: absolute; border-radius: 9999px; filter: blur(22px); pointer-events: none; }
.nt-orb-a { width: 180px; height: 180px; left: -50px; top: -80px; background: radial-gradient(circle, rgba(61, 82, 160, 0.34), transparent 70%); animation: nt-drift 9s ease-in-out infinite; }
.nt-orb-b { width: 170px; height: 170px; right: 10%; bottom: -100px; background: radial-gradient(circle, rgba(112, 145, 230, 0.32), transparent 70%); animation: nt-drift 11s ease-in-out infinite reverse; }
@keyframes nt-drift { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(24px, 10px, 0); } }

/* Counts. A number means someone is waiting on you; a dot means something new to read. */
.nt-count {
  position: absolute; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9999px;
  display: inline-grid; place-items: center; font-size: 10px; font-weight: 800; line-height: 1;
  color: #fff; background: #E11D48; box-shadow: 0 0 0 2px #fff; font-variant-numeric: tabular-nums;
  animation: nt-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.nt-count::after {
  content: ""; position: absolute; inset: -3px; border-radius: inherit; border: 2px solid #E11D48;
  opacity: 0; animation: nt-halo 2.4s ease-out 0.4s infinite;
}
.nt-dot {
  position: absolute; width: 9px; height: 9px; border-radius: 9999px; background: #3D52A0;
  box-shadow: 0 0 0 2px #fff; animation: nt-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes nt-pop { 0% { transform: scale(0) rotateY(-180deg); } 70% { transform: scale(1.2) rotateY(0); } 100% { transform: scale(1); } }
@keyframes nt-halo { 0% { transform: scale(0.9); opacity: 0.7; } 100% { transform: scale(1.9); opacity: 0; } }

/* A count that changes turns over like a card. */
.nt-flip { display: inline-block; animation: nt-flip 0.36s cubic-bezier(0.22, 1, 0.36, 1) both; transform-origin: 50% 50%; backface-visibility: hidden; }
@keyframes nt-flip { from { transform: perspective(120px) rotateX(-95deg); opacity: 0; } to { transform: none; opacity: 1; } }

/* The bell: brushed metal, and one quick swing in 3D when a note lands. */
.nt-bell-body { transform-origin: 22px 6px; }
.nt-ring .nt-bell-body { animation: nt-ring 0.7s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
.nt-ring .nt-bell-clap { animation: nt-clap 0.7s ease-in-out; }
@keyframes nt-ring {
  0%, 100% { transform: perspective(80px) rotate(0) rotateY(0); }
  20% { transform: perspective(80px) rotate(16deg) rotateY(18deg); }
  45% { transform: perspective(80px) rotate(-12deg) rotateY(-14deg); }
  70% { transform: perspective(80px) rotate(6deg) rotateY(6deg); }
}
@keyframes nt-clap { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 55% { transform: translateX(3px); } }

/* A live change on the screen you are on: one glow, then still. */
.nt-live { animation: nt-glow 1.1s ease-out 2; }
@keyframes nt-glow { 0% { box-shadow: 0 0 0 0 rgba(61, 82, 160, 0.45); } 100% { box-shadow: 0 0 0 12px rgba(61, 82, 160, 0); } }
.nt-live-dot { position: relative; width: 8px; height: 8px; border-radius: 9999px; background: #10B981; flex: none; }
.nt-live-dot::after { content: ""; position: absolute; inset: -4px; border-radius: inherit; border: 2px solid #10B981; opacity: 0; animation: nt-halo 2s ease-out infinite; }

/* The "needs you" chip on a row. */
.nt-needs { box-shadow: 0 0 0 1px rgba(61, 82, 160, 0.18) inset; }

@media (prefers-reduced-motion: reduce) {
  .nt-sheen::before, .nt-orb-a, .nt-orb-b, .nt-count, .nt-count::after, .nt-dot, .nt-flip,
  .nt-ring .nt-bell-body, .nt-ring .nt-bell-clap, .nt-live, .nt-live-dot::after { animation: none !important; }
}
`;

let added = false;
export function addNotifyStyles(): void {
  if (added || typeof document === 'undefined') return;
  added = true;
  const el = document.createElement('style');
  el.setAttribute('data-studiodesk', 'notify');
  el.textContent = NOTIFY_CSS;
  document.head.appendChild(el);
}
addNotifyStyles();
