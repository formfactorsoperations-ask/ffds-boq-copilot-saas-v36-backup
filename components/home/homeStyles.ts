/*
  Home: the materials of the story deck (DESIGN.md → "Home stories").

  Approved by the studio owner on 12 Oct 2026, for Home only: five
  materials a card, ring or swatch is made of. Indigo is the brand; brass,
  rose and sage are the accents Home already used (Reports, Blocked,
  Clients); periwinkle is the brand lightened, and navy the brand darkened.
  Nothing else. Every motion stops under prefers-reduced-motion.

  Shipped as a module that adds itself to the page, like
  components/people/peopleStyles.ts, so no .css file can be left behind.
*/
const HOME_CSS = `
.hs-indigo { background: linear-gradient(140deg, #5268BE 0%, #3D52A0 52%, #2E3F84 100%); }
.hs-periwinkle { background: linear-gradient(140deg, #9AB0F0 0%, #7B93E6 55%, #5F79D6 100%); }
.hs-brass {
  background:
    linear-gradient(115deg, transparent 30%, rgba(255, 244, 214, 0.45) 46%, transparent 60%),
    linear-gradient(140deg, #D9BF88 0%, #B5945B 45%, #8B6B38 100%);
}
.hs-rose {
  background:
    radial-gradient(circle at 18% 28%, rgba(255, 255, 255, 0.55) 0 4px, transparent 5px),
    radial-gradient(circle at 72% 18%, rgba(181, 148, 91, 0.9) 0 5px, transparent 6px),
    radial-gradient(circle at 84% 64%, rgba(255, 255, 255, 0.4) 0 3px, transparent 4px),
    radial-gradient(circle at 34% 78%, rgba(255, 255, 255, 0.35) 0 3px, transparent 4px),
    linear-gradient(140deg, #C9567E 0%, #B4436A 55%, #93305A 100%);
}
.hs-sage {
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.10) 0 3px, transparent 3px 11px),
    linear-gradient(140deg, #1E9470 0%, #0E7C5A 55%, #0A6248 100%);
}
.hs-navy {
  background:
    repeating-linear-gradient(135deg, rgba(123, 147, 230, 0.32) 0 2px, transparent 2px 9px),
    linear-gradient(140deg, #2B3A78 0%, #1E2A5A 100%);
}

/* The deck: a stage the cards fan across, and a soft floor shadow. */
.hs-stage { perspective: 1400px; }
.hs-card { transform-style: preserve-3d; will-change: transform; }
.hs-sheen::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, 0.28) 50%, transparent 65%);
  transform: translateX(-120%);
  animation: hs-sheen 5s ease-in-out 1.5s infinite;
}
@keyframes hs-sheen { 0%, 72% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }

/* A ring around each story, like a stamp. */
.hs-ring { box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--hs-edge, #3D52A0), 0 14px 26px -14px rgba(10, 27, 51, 0.6); }

@media (prefers-reduced-motion: reduce) {
  .hs-sheen::after { animation: none !important; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('hs-styles')) {
  const style = document.createElement('style');
  style.id = 'hs-styles';
  style.textContent = HOME_CSS;
  document.head.appendChild(style);
}

/** The edge colour of each material, for the stamp ring round a story. */
export const EDGE: Record<string, string> = {
  indigo: '#3D52A0', periwinkle: '#7B93E6', brass: '#B5945B', rose: '#B4436A', sage: '#0E7C5A', navy: '#1E2A5A',
};

export {};
