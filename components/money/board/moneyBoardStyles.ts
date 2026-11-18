/*
  Money board motion (DESIGN.md → "Money motion").

  The owner chose this version on 18 Nov 2026: design and execution side by
  side, the GST plate on each track, and motion from the kits already
  approved for People, Ops Desk and Pricing & Tiers. Same fonts, brand
  #3D52A0, slate, and rose/amber/emerald for state; nothing else. Every
  animation here stops under prefers-reduced-motion.

  Shipped inside this module, like peopleStyles.ts, so the styles cannot be
  left behind when the app is copied without a separate .css file.
*/
const MONEY_BOARD_CSS = `
/* GST in a bar: brand stripes that drift, so it reads apart from the invoiced part. */
.mb-gst {
  background: repeating-linear-gradient(135deg, rgba(61, 82, 160, 0.9) 0 4px, rgba(61, 82, 160, 0.5) 4px 8px);
  background-size: 11.32px 11.32px;
  animation: mb-drift 1.4s linear infinite;
}
@keyframes mb-drift { to { background-position: 11.32px 0; } }

/* A figure that just changed in a preview: one light sweep. */
.mb-sheen { position: relative; overflow: hidden; }
.mb-sheen::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.85) 50%, transparent 70%);
  transform: translateX(-100%); animation: mb-sheen 1s ease forwards;
}
@keyframes mb-sheen { to { transform: translateX(100%); } }

/* Earned: a soft brand halo breathes round the icon until it is invoiced. */
.mb-halo { position: relative; }
.mb-halo::after {
  content: ''; position: absolute; inset: -5px; border-radius: 14px; pointer-events: none;
  border: 2px solid rgba(61, 82, 160, 0.55); animation: mb-halo 2.2s ease-in-out infinite;
}
@keyframes mb-halo { 0%, 100% { opacity: 0; transform: scale(0.88); } 50% { opacity: 1; transform: scale(1); } }

/* A stamp lands on the card when it is sent, paid or earned, then fades. */
.mb-stamp {
  position: absolute; right: 16px; top: 46px; z-index: 4; pointer-events: none;
  border: 2px solid currentColor; border-radius: 8px; padding: 2px 10px; background: rgba(255, 255, 255, 0.92);
  animation: mb-stamp 2s cubic-bezier(0.3, 1.6, 0.5, 1) forwards;
}
@keyframes mb-stamp {
  0% { transform: scale(2.1) rotate(-20deg); opacity: 0; }
  18% { transform: scale(1) rotate(-8deg); opacity: 1; }
  80% { transform: scale(1) rotate(-8deg); opacity: 1; }
  100% { transform: scale(1) rotate(-8deg); opacity: 0; }
}

/* Raised: a paper plane leaves the card. */
.mb-plane { position: absolute; left: 56px; bottom: 16px; z-index: 5; pointer-events: none; animation: mb-fly 1s cubic-bezier(0.4, 0, 0.6, 1) forwards; }
@keyframes mb-fly {
  0% { transform: translate(0, 0) rotate(0) scale(0.6); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translate(260px, -160px) rotate(14deg) scale(1.1); opacity: 0; }
}

/* A change from the portal or the site, not this screen: a badge turns in and leaves. */
.mb-live {
  position: absolute; right: 14px; top: -11px; z-index: 4;
  animation: mb-live-in 0.5s cubic-bezier(0.3, 1.5, 0.5, 1), mb-live-out 0.5s 3s forwards;
}
@keyframes mb-live-in { from { transform: perspective(300px) rotateX(90deg); opacity: 0; } }
@keyframes mb-live-out { to { opacity: 0; transform: translateY(-6px); } }

/* The ring segments slide to new values. */
.mb-ring circle { transition: stroke-dasharray 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1); }

/* Cards lift; the chevron turns. */
.mb-card { transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 260ms ease, border-color 200ms ease; }
.mb-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px -22px rgba(30, 41, 59, 0.45); }
.mb-turn { transition: transform 300ms cubic-bezier(0.3, 1.5, 0.5, 1); }

@media (prefers-reduced-motion: reduce) {
  .mb-gst, .mb-sheen::after, .mb-halo::after, .mb-stamp, .mb-plane, .mb-live { animation: none !important; }
  .mb-stamp, .mb-plane { display: none; }
  .mb-ring circle, .mb-card, .mb-turn { transition: none !important; }
  .mb-card:hover { transform: none; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('money-board-styles')) {
  const el = document.createElement('style');
  el.id = 'money-board-styles';
  el.textContent = MONEY_BOARD_CSS;
  document.head.appendChild(el);
}

export {};
