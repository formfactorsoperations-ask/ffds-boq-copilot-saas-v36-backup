/*
  Studio stories: their tints and motion (DESIGN.md → "Studio stories").

  Approved by the studio owner on 26 Nov 2026, from the mockup they chose
  after asking for softer colours: the paper tints of Home's day pins
  (indigo for a thank-you, sage for a birthday, brass for an anniversary),
  on white. The ring of a story not yet watched turns; the collectible card
  catches the light as it tilts, deals in and turns over. Every motion stops
  under prefers-reduced-motion.

  Added to the page when first imported, like homeStyles.ts, so no .css file
  can be left behind.
*/
export type StoryTone = 'kudos' | 'birthday' | 'anniversary';

/** The day pins' paper tints (components/home/DayBoard.tsx), one for each kind of story. */
export const TINT: Record<StoryTone, { bg: string; fg: string; bd: string }> = {
  kudos: { bg: '#ECEFFB', fg: '#3D52A0', bd: '#D5DCF5' },
  birthday: { bg: '#E7F5EF', fg: '#0E7C5A', bd: '#C8E8DA' },
  anniversary: { bg: '#FBF5EA', fg: '#8C6A33', bd: '#EBDDC2' },
};

const STORY_CSS = `
@property --ss-spin { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes ss-turn { to { --ss-spin: 360deg; } }
.ss-ring { background: conic-gradient(from var(--ss-spin), #3D52A0, #5F79D6, #D5DCF5, #3D52A0); animation: ss-turn 4s linear infinite; }
.ss-ring-seen { background: #E2E8F0; }

@keyframes ss-sheen { from { background-position: 130% 0; } to { background-position: -130% 0; } }
/* Only on cards already placed absolutely (the mini card, the card's faces). */
.ss-sheen { overflow: hidden; }
.ss-sheen::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .7;
  background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, .6) 50%, transparent 62%);
  background-size: 260% 100%; animation: ss-sheen 3.6s ease-in-out infinite;
}

.ss-3d { transform-style: preserve-3d; }
.ss-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.ss-back { transform: rotateY(180deg); }
.ss-flip { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform .8s cubic-bezier(.5, .1, .2, 1.2); }
.ss-flip.is-flipped { transform: rotateY(180deg); }

@keyframes ss-deal { 0% { opacity: 0; transform: translateY(-60px) rotate(-12deg) scale(.7) rotateY(-180deg); } 100% { opacity: 1; transform: none; } }
.ss-deal { animation: ss-deal .9s cubic-bezier(.2, .9, .25, 1.12) both; }

.ss-foil {
  position: absolute; inset: 0; pointer-events: none; opacity: .22;
  background: repeating-linear-gradient(115deg, transparent 0%, rgba(95, 121, 214, .5) 7%, rgba(16, 185, 129, .4) 14%, rgba(245, 158, 11, .35) 21%, transparent 28%);
  background-size: 260% 260%; background-position: var(--ss-px, 50%) var(--ss-py, 50%);
}
.ss-glare { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at var(--ss-gx, 50%) var(--ss-gy, 30%), rgba(255, 255, 255, .55), transparent 48%); }

@keyframes ss-in { from { opacity: 0; } to { opacity: 1; } }
.ss-in { animation: ss-in .3s ease both; }
@keyframes ss-frame { from { transform: scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
.ss-frame { animation: ss-frame .45s cubic-bezier(.34, 1.3, .64, 1) both; }
@keyframes ss-swap { from { opacity: .3; transform: translateX(20px); } to { opacity: 1; transform: none; } }
.ss-swap { animation: ss-swap .35s cubic-bezier(.16, 1, .3, 1) both; }
@keyframes ss-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.ss-rise { animation: ss-rise .5s .45s both; }
@keyframes ss-float {
  0% { opacity: 0; transform: translate(0, 0) scale(.4); }
  15% { opacity: 1; transform: translate(0, -20px) scale(1.15); }
  100% { opacity: 0; transform: translate(var(--ss-dx, 0px), -220px) scale(.9); }
}
.ss-float { animation: ss-float 1.6s cubic-bezier(.2, .7, .3, 1) forwards; }
@keyframes ss-toast { 0% { opacity: 0; transform: translate(-50%, 10px); } 15%, 80% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; } }
.ss-toast { animation: ss-toast 2.2s ease forwards; }

.ss-tile { transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s; }
.ss-tile:hover { transform: translateY(-4px); box-shadow: 0 18px 40px -22px rgba(30, 42, 90, .35); }
.ss-tile .ss-mini { transition: transform .35s; transform: rotate(-4deg); }
.ss-tile:hover .ss-mini { transform: rotate(0) scale(1.06); }

.ss-strip { scrollbar-width: none; }
.ss-strip::-webkit-scrollbar { display: none; }

@media (prefers-reduced-motion: reduce) {
  .ss-ring, .ss-sheen::after, .ss-deal, .ss-in, .ss-frame, .ss-swap, .ss-rise, .ss-float, .ss-toast { animation: none !important; }
  .ss-flip, .ss-tile, .ss-tile .ss-mini { transition: none !important; }
  .ss-tile:hover, .ss-tile:hover .ss-mini { transform: none; }
  .ss-float { display: none; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('studio-stories-css')) {
  const el = document.createElement('style');
  el.id = 'studio-stories-css';
  el.textContent = STORY_CSS;
  document.head.appendChild(el);
}
