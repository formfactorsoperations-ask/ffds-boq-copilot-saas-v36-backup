import React, { useRef } from 'react';

/*
  DESIGN DESK 2.0 MOTION (DESIGN.md, "Design Desk 2.0 motion", asked for by
  the owner on 24 Nov 2026): depth and movement for the drawing screen's
  notes and review panel.

  - dd2-pin: a note's pin on the drawing, a raised badge that drops in, lifts
    under the pointer and rings while its note is being looked at;
  - dd2-bubble: the note that opens beside a pin on hover;
  - Tilt (dd2-tilt): a card that leans towards the pointer, with a soft light;
  - dd2-dock / dd2-key / dd2-ico: the tool bar as a raised dock, each tool a
    key that lifts on hover and sinks when pressed, its icon in a filled tile;
  - dd2-badge: a note's number as a small raised badge in the list;
  - dd2-go: the main decision button, with depth and a passing light;
  - dd2-dot: the breathing dot beside "Your turn".

  Colours are the desk's own (rose notes, emerald done, amber client and
  changes, slate, the brand blue). Everything stops under
  prefers-reduced-motion, and nothing tilts on touch.
*/

export const DeskMotionStyles = () => (
  <style>{`
    @keyframes dd2PinIn { 0% { transform: translate(-50%, -50%) scale(0); opacity: 0 } 70% { transform: translate(-50%, -50%) scale(1.18); opacity: 1 } 100% { transform: translate(-50%, -50%) scale(1) } }
    @keyframes dd2Ring { from { opacity: .85; transform: scale(.85) } to { opacity: 0; transform: scale(1.75) } }
    @keyframes dd2Bubble { from { opacity: 0; transform: perspective(600px) translateY(8px) rotateX(-18deg) scale(.94) } to { opacity: 1; transform: none } }
    @keyframes dd2Dot { 50% { transform: scale(1.6); opacity: .45 } }
    @keyframes dd2Sheen { from { transform: translateX(-120%) skewX(-20deg) } to { transform: translateX(320%) skewX(-20deg) } }

    .dd2-pin {
      position: absolute; transform: translate(-50%, -50%); z-index: 2;
      width: max(28px, 3.3%); aspect-ratio: 1; container-type: inline-size;
      display: grid; place-items: center; border-radius: 9999px; border: 2px solid #fff; color: #fff; font-weight: 800; cursor: pointer;
      background: radial-gradient(circle at 32% 26%, rgba(255,255,255,.6), rgba(255,255,255,0) 46%), var(--pin);
      box-shadow: 0 2px 0 rgba(15,23,42,.2), 0 9px 14px -5px rgba(15,23,42,.5), inset 0 -3px 5px rgba(0,0,0,.22);
      animation: dd2PinIn .45s cubic-bezier(.2,.9,.25,1.3) both;
      transition: transform .18s cubic-bezier(.2,.9,.25,1.3), box-shadow .18s;
    }
    .dd2-pin > b { font-size: 46cqw; line-height: 1 }
    .dd2-pin:hover, .dd2-pin.is-hot { transform: translate(-50%, -64%) scale(1.16); z-index: 4; box-shadow: 0 3px 0 rgba(15,23,42,.2), 0 18px 22px -8px rgba(15,23,42,.55), inset 0 -3px 5px rgba(0,0,0,.22) }
    .dd2-pin.is-hot::after, .dd2-pin.is-picked::after { content: ''; position: absolute; inset: -5px; border-radius: 9999px; border: 2px solid var(--pin); animation: dd2Ring 1.3s ease-out infinite; pointer-events: none }
    .dd2-pin.is-off { pointer-events: none }

    .dd2-bubble { animation: dd2Bubble .22s cubic-bezier(.2,.9,.25,1.2) both; pointer-events: none }

    .dd2-tilt { position: relative; transform: perspective(700px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s, border-color .2s }
    .dd2-tilt:hover, .dd2-tilt.is-hot { box-shadow: 0 16px 28px -16px rgba(15,23,42,.4) }
    .dd2-tilt.is-hot { transform: perspective(700px) translateY(-2px) }
    .dd2-tilt > .dd2-light { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .2s; background: radial-gradient(circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,.7), rgba(255,255,255,0) 58%) }
    .dd2-tilt:hover > .dd2-light { opacity: 1 }

    .dd2-dock { background: linear-gradient(#ffffff, #f1f5f9); box-shadow: inset 0 1px 0 #fff, 0 3px 0 rgba(15,23,42,.09), 0 24px 40px -18px rgba(15,23,42,.55) }
    .dd2-key { transition: transform .15s cubic-bezier(.2,.9,.25,1.3), box-shadow .15s, background-color .15s, color .15s }
    .dd2-key:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 3px 0 rgba(15,23,42,.1), 0 10px 14px -8px rgba(15,23,42,.35) }
    .dd2-key:active:not(:disabled), .dd2-key[aria-pressed="true"] { transform: translateY(1px); box-shadow: inset 0 2px 5px rgba(15,23,42,.3) }
    .dd2-ico { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 9px; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.45), inset 0 -2px 3px rgba(0,0,0,.2), 0 1px 2px rgba(15,23,42,.25); transition: transform .22s cubic-bezier(.2,.9,.25,1.4) }
    .dd2-key:hover:not(:disabled) .dd2-ico { transform: rotate(-9deg) scale(1.12) }

    .dd2-badge { background: radial-gradient(circle at 32% 26%, rgba(255,255,255,.6), rgba(255,255,255,0) 46%), var(--pin); box-shadow: 0 2px 0 rgba(15,23,42,.16), inset 0 -2px 4px rgba(0,0,0,.2); transition: transform .2s cubic-bezier(.2,.9,.25,1.4) }
    .dd2-tilt:hover .dd2-badge, .dd2-tilt.is-hot .dd2-badge { transform: scale(1.12) rotate(-8deg) }

    .dd2-go { position: relative; overflow: hidden; box-shadow: 0 3px 0 #047857, 0 12px 18px -10px rgba(5,150,105,.8); transition: transform .15s, box-shadow .15s, background-color .15s }
    .dd2-go:hover:not(:disabled) { transform: translateY(-1px) }
    .dd2-go:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #047857 }
    .dd2-go:disabled { box-shadow: none }
    .dd2-go::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 35%; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.35), rgba(255,255,255,0)); transform: translateX(-120%) skewX(-20deg); pointer-events: none }
    .dd2-go:hover:not(:disabled)::after { animation: dd2Sheen .9s ease-out }

    .dd2-dot { animation: dd2Dot 1.6s ease-in-out infinite }

    @media (prefers-reduced-motion: reduce) {
      .dd2-pin, .dd2-bubble, .dd2-dot, .dd2-pin.is-hot::after, .dd2-pin.is-picked::after, .dd2-go:hover:not(:disabled)::after { animation: none !important }
      .dd2-pin, .dd2-tilt, .dd2-key, .dd2-ico, .dd2-badge, .dd2-go { transition: none !important }
      .dd2-tilt { transform: none !important }
      .dd2-pin:hover, .dd2-pin.is-hot { transform: translate(-50%, -50%) }
      .dd2-key:hover:not(:disabled), .dd2-key:hover:not(:disabled) .dd2-ico, .dd2-go:hover:not(:disabled) { transform: none }
    }
  `}</style>
);

/** A card that leans a few degrees towards the mouse, with a soft light where the pointer is. Still on touch. */
export const Tilt: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties; max?: number; [attr: string]: unknown }> = ({ children, className = '', style, max = 5, ...rest }) => {
  const el = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const node = el.current;
    if (!node || e.pointerType !== 'mouse') return;
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    node.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    node.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    node.style.setProperty('--mx', `${Math.round(x * 100)}%`);
    node.style.setProperty('--my', `${Math.round(y * 100)}%`);
  };
  const leave = () => { el.current?.style.setProperty('--rx', '0deg'); el.current?.style.setProperty('--ry', '0deg'); };
  return (
    <div ref={el} className={`dd2-tilt ${className}`} style={style} onPointerMove={move} onPointerLeave={leave} {...rest}>
      {children}
      <span className="dd2-light" aria-hidden />
    </div>
  );
};
