import React, { useRef } from 'react';

/*
  DESIGN DESK 2.0 MOTION: "Living icons" (DESIGN.md, "Design Desk 2.0
  motion"). The owner chose it on 24 Nov 2026 from four live options, for the
  drawing screen's tools, note pins and review panel.

  Every tool's icon acts out what the tool does, so the tool bar teaches
  itself: the pin drops, the box draws its outline, the arrow shoots, the pen
  writes, Compare slides and Changes twinkles. The icons are drawn here
  (LiveIcon) because their parts move on their own, which a stock icon's
  cannot.

  - dd2-dock / dd2-key / dd2-ico: the tool bar, each tool in a soft round tile
    of its own colour that fills when it is under the pointer or in hand;
  - dd2-pin: a note's pin on the drawing; an open note sends out ripples;
  - dd2-bubble / dd2-lead: the note that springs out of a pin on a dotted line;
  - Tilt (dd2-tilt) and dd2-note: a note's card, which leans a little, grows a
    coloured edge and bounces its number when it or its pin is looked at;
  - dd2-go and dd2-tick: Approve, and the big tick it draws over the drawing;
  - dd2-dot: the breathing dot beside "Your turn".

  Colours are the desk's own (rose notes, emerald done, amber client and
  changes, slate, the brand blue). Everything stops under
  prefers-reduced-motion, and nothing tilts on touch.
*/

export type LiveTool = 'select' | 'pin' | 'rect' | 'arrow' | 'pen' | 'compare' | 'changes';

/** The colour of each tool's tile. */
export const TOOL_COLOR: Record<LiveTool, string> = { select: '#334155', pin: '#E11D48', rect: '#D97706', arrow: '#059669', pen: '#3D52A0', compare: '#475569', changes: '#D97706' };

const PARTS: Record<LiveTool, React.ReactNode> = {
  select: <path className="f" d="M5 3l14 7-6 2-2 6z" />,
  pin: <><path className="f" d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></>,
  rect: <rect className="f dr" x="4" y="5" width="16" height="14" rx="2" />,
  arrow: <><path d="M5 19L19 5" /><path d="M10 5h9v9" /></>,
  pen: <><path className="f" d="M5 16L16 5l3 3L8 19l-4 1z" /><path className="sq" d="M13 21c2-1.6 3.4 1.2 6 0" /></>,
  compare: <><rect className="f" x="3" y="5" width="18" height="14" rx="2" /><path className="sl" d="M12 3v18" /></>,
  changes: <><path className="f" d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M19 15v5M16.5 17.5h5" /></>,
};

/** A tool's icon in its round tile. It moves when its key (`dd2-key`) is hovered, has just been picked, or is being shown off. */
export const LiveIcon: React.FC<{ tool: LiveTool }> = ({ tool }) => (
  <span className="dd2-ico" aria-hidden><svg viewBox="0 0 24 24">{PARTS[tool]}</svg></span>
);

export const DeskMotionStyles = () => (
  <style>{`
    @keyframes dd2PinIn { from { transform: translate(-50%, -50%) scale(0) } to { transform: translate(-50%, -50%) scale(1) } }
    @keyframes dd2Ripple { from { transform: scale(.9); opacity: .8 } to { transform: scale(2.3); opacity: 0 } }
    @keyframes dd2Bubble { from { opacity: 0; transform: scale(.78) } to { opacity: 1; transform: none } }
    @keyframes dd2Dash { to { background-position: 0 7px } }
    @keyframes dd2Dot { 50% { transform: scale(1.6); opacity: .45 } }
    @keyframes dd2Click { 0%, 100% { transform: none } 40% { transform: translate(2px, 2px) scale(.82) } }
    @keyframes dd2Drop { 0% { transform: translateY(-9px) } 55% { transform: translateY(1px) scale(1.08, .9) } 100% { transform: none } }
    @keyframes dd2Draw { 0% { stroke-dashoffset: 64 } 60%, 100% { stroke-dashoffset: 0 } }
    @keyframes dd2Write { from { stroke-dashoffset: 14 } to { stroke-dashoffset: 0 } }
    @keyframes dd2Shoot { 0% { transform: translate(-4px, 4px); opacity: .3 } 60% { transform: translate(3px, -3px); opacity: 1 } 100% { transform: none } }
    @keyframes dd2Wag { 0%, 100% { transform: rotate(0) } 30% { transform: rotate(-12deg) translate(-1px, 1px) } 70% { transform: rotate(8deg) translate(2px, 0) } }
    @keyframes dd2Slide { 0%, 100% { transform: translateX(-5px) } 50% { transform: translateX(5px) } }
    @keyframes dd2Twinkle { 0%, 100% { transform: scale(1) rotate(0) } 50% { transform: scale(1.28) rotate(22deg) } }
    @keyframes dd2Turn { to { transform: rotate(90deg) } }
    @keyframes dd2Pulse { 50% { transform: scale(1.3) } }
    @keyframes dd2TickIn { 0% { transform: scale(0); opacity: 0 } 25% { transform: scale(1); opacity: 1 } 80% { transform: scale(1); opacity: 1 } 100% { transform: scale(1.5); opacity: 0 } }
    @keyframes dd2TickDraw { to { stroke-dashoffset: 0 } }

    /* ---- the tool bar */
    .dd2-dock { background: #fff; box-shadow: 0 18px 34px -18px rgba(15,23,42,.5) }
    .dd2-key { --c: #334155; transition: background-color .2s, color .2s }
    .dd2-ico { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 9999px; background: #F1F5F9; background: color-mix(in srgb, var(--c) 14%, #fff); color: var(--c); transition: background-color .2s, color .2s, transform .2s cubic-bezier(.3,1.5,.5,1) }
    .dd2-ico svg { width: 20px; height: 20px; overflow: visible; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
    .dd2-ico .f { fill: color-mix(in srgb, var(--c) 26%, transparent) }
    .dd2-key:hover:not(:disabled) .dd2-ico, .dd2-key[aria-pressed="true"] .dd2-ico, .dd2-key.is-demo .dd2-ico { background: var(--c); color: #fff; transform: scale(1.1) }
    .dd2-key:hover:not(:disabled) .dd2-ico .f, .dd2-key[aria-pressed="true"] .dd2-ico .f, .dd2-key.is-demo .dd2-ico .f { fill: rgba(255,255,255,.3) }
    .dd2-key.is-tool[aria-pressed="true"] { background: #F1F5F9; background: color-mix(in srgb, var(--c) 13%, #fff); color: var(--c) }

    /* each icon acts out its tool: again and again under the pointer, once when it is picked or shown off */
    .dd2-key:hover[data-tool="select"] .dd2-ico svg { animation: dd2Click .9s ease-in-out infinite }
    .dd2-key:hover[data-tool="pin"] .dd2-ico svg { animation: dd2Drop .9s cubic-bezier(.3,1.6,.5,1) infinite }
    .dd2-key:hover[data-tool="rect"] .dd2-ico .dr { stroke-dasharray: 64; animation: dd2Draw 1.2s ease-in-out infinite }
    .dd2-key:hover[data-tool="arrow"] .dd2-ico svg { animation: dd2Shoot .8s ease-in-out infinite }
    .dd2-key:hover[data-tool="pen"] .dd2-ico svg { animation: dd2Wag .7s ease-in-out infinite }
    .dd2-key:hover[data-tool="pen"] .dd2-ico .sq { stroke-dasharray: 14; animation: dd2Write .7s linear infinite }
    .dd2-key:hover[data-tool="compare"] .dd2-ico .sl { animation: dd2Slide 1s ease-in-out infinite }
    .dd2-key:hover[data-tool="changes"] .dd2-ico svg { animation: dd2Twinkle .9s ease-in-out infinite }
    :is(.dd2-key.is-demo, .dd2-key.is-tool[aria-pressed="true"]):not(:hover)[data-tool="select"] .dd2-ico svg { animation: dd2Click .9s ease-in-out 1 }
    :is(.dd2-key.is-demo, .dd2-key.is-tool[aria-pressed="true"]):not(:hover)[data-tool="pin"] .dd2-ico svg { animation: dd2Drop .9s cubic-bezier(.3,1.6,.5,1) 1 }
    :is(.dd2-key.is-demo, .dd2-key.is-tool[aria-pressed="true"]):not(:hover)[data-tool="rect"] .dd2-ico .dr { stroke-dasharray: 64; animation: dd2Draw 1.2s ease-in-out 1 }
    :is(.dd2-key.is-demo, .dd2-key.is-tool[aria-pressed="true"]):not(:hover)[data-tool="arrow"] .dd2-ico svg { animation: dd2Shoot .8s ease-in-out 1 }
    :is(.dd2-key.is-demo, .dd2-key.is-tool[aria-pressed="true"]):not(:hover)[data-tool="pen"] .dd2-ico svg { animation: dd2Wag .7s ease-in-out 2 }
    :is(.dd2-key.is-demo, .dd2-key.is-tool[aria-pressed="true"]):not(:hover)[data-tool="pen"] .dd2-ico .sq { stroke-dasharray: 14; animation: dd2Write .7s linear 2 }
    .dd2-key.is-demo:not(:hover)[data-tool="compare"] .dd2-ico .sl { animation: dd2Slide 1s ease-in-out 1 }
    .dd2-key.is-demo:not(:hover)[data-tool="changes"] .dd2-ico svg { animation: dd2Twinkle .9s ease-in-out 1 }
    /* the plain keys move a little too */
    .dd2-key .dd2-plain { transition: transform .2s cubic-bezier(.3,1.5,.5,1) }
    .dd2-key:hover:not(:disabled) .dd2-plain.turn { animation: dd2Turn .5s cubic-bezier(.3,1.5,.5,1) }
    .dd2-key:hover:not(:disabled) .dd2-plain.pulse { animation: dd2Pulse .5s ease-in-out }
    .dd2-key:hover:not(:disabled) .dd2-plain.grow { transform: scale(1.22) }
    .dd2-key:hover:not(:disabled) .dd2-plain.shift { transform: translateX(3px) }

    /* ---- pins on the drawing */
    .dd2-pin {
      position: absolute; transform: translate(-50%, -50%); z-index: 2;
      width: max(28px, 3.3%); aspect-ratio: 1; container-type: inline-size;
      display: grid; place-items: center; border-radius: 9999px; border: 2px solid #fff; color: #fff; font-weight: 800; cursor: pointer;
      background: var(--pin); box-shadow: 0 5px 12px -4px rgba(15,23,42,.55);
      animation: dd2PinIn .5s cubic-bezier(.3,1.6,.5,1) both; transition: transform .2s cubic-bezier(.3,1.6,.5,1);
    }
    .dd2-pin > b { font-size: 46cqw; line-height: 1 }
    .dd2-pin.is-open::before, .dd2-pin.is-open::after { content: ''; position: absolute; inset: -3px; border-radius: 9999px; border: 2px solid var(--pin); animation: dd2Ripple 2.2s ease-out infinite; pointer-events: none }
    .dd2-pin.is-open::after { animation-delay: 1.1s }
    .dd2-pin:hover, .dd2-pin.is-hot, .dd2-pin.is-picked { transform: translate(-50%, -50%) scale(1.25); z-index: 6 }
    .dd2-pin.is-off { pointer-events: none }
    .dd2-pin.is-off::before, .dd2-pin.is-off::after { animation: none; opacity: 0 }

    .dd2-bubble { animation: dd2Bubble .3s cubic-bezier(.3,1.5,.5,1) both; pointer-events: none }
    .dd2-lead { position: absolute; width: 2px; height: 26px; margin-left: -1px; background: repeating-linear-gradient(var(--pin) 0 4px, transparent 4px 7px); animation: dd2Dash .4s linear infinite; pointer-events: none }

    /* ---- note cards */
    .dd2-tilt { position: relative; transform: perspective(700px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s, border-color .2s }
    .dd2-tilt > .dd2-light { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .2s; background: radial-gradient(circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,.7), rgba(255,255,255,0) 58%) }
    .dd2-tilt:hover > .dd2-light { opacity: 1 }
    .dd2-note { overflow: hidden }
    .dd2-note::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--pin); transform: scaleY(0); transform-origin: top; transition: transform .3s cubic-bezier(.3,1.4,.5,1) }
    .dd2-note:hover::before, .dd2-note.is-hot::before { transform: scaleY(1) }
    .dd2-note:hover, .dd2-note.is-hot { box-shadow: 0 14px 22px -14px var(--pin) }
    .dd2-note:hover .dd2-badge, .dd2-note.is-hot .dd2-badge { animation: dd2Drop .6s cubic-bezier(.3,1.6,.5,1) }
    .dd2-badge { background: var(--pin) }

    /* ---- the decision */
    .dd2-go { transition: transform .2s cubic-bezier(.3,1.5,.5,1), background-color .15s }
    .dd2-go:hover:not(:disabled) { transform: scale(1.03) }
    .dd2-go:hover:not(:disabled) svg { animation: dd2Drop .6s cubic-bezier(.3,1.6,.5,1) }
    .dd2-go:active:not(:disabled) { transform: scale(.97) }
    .dd2-tick { position: absolute; left: 50%; top: 42%; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 9999px; background: #059669; display: grid; place-items: center; z-index: 20; pointer-events: none; box-shadow: 0 20px 40px -12px rgba(5,150,105,.7); animation: dd2TickIn 1.1s cubic-bezier(.3,1.5,.5,1) forwards }
    .dd2-tick svg { width: 64px; height: 64px; fill: none; stroke: #fff; stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 30; stroke-dashoffset: 30; animation: dd2TickDraw .4s .2s forwards }
    .dd2-dot { animation: dd2Dot 1.6s ease-in-out infinite }

    @media (prefers-reduced-motion: reduce) {
      .dd2-pin, .dd2-pin::before, .dd2-pin::after, .dd2-bubble, .dd2-lead, .dd2-dot, .dd2-tick, .dd2-tick svg, .dd2-ico svg, .dd2-ico svg *, .dd2-plain, .dd2-badge, .dd2-go svg { animation: none !important }
      .dd2-pin, .dd2-tilt, .dd2-ico, .dd2-plain, .dd2-go, .dd2-note::before { transition: none !important }
      .dd2-tilt { transform: none !important }
      .dd2-pin.is-open::before, .dd2-pin.is-open::after { display: none }
      .dd2-tick svg { stroke-dashoffset: 0 }
      .dd2-key:hover:not(:disabled) .dd2-ico, .dd2-key:hover:not(:disabled) .dd2-plain, .dd2-go:hover:not(:disabled) { transform: none }
    }
  `}</style>
);

/** A card that leans a few degrees towards the mouse, with a soft light where the pointer is. Still on touch. */
export const Tilt: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties; max?: number; [attr: string]: unknown }> = ({ children, className = '', style, max = 3, ...rest }) => {
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
