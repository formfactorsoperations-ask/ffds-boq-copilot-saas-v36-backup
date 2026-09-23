import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readPortalView } from '../../services/portalViewService';
import { buildHubAlerts, HubAlert } from '../../lib/hubAlerts';

/**
 * What is waiting on you, at the end of the project hub row.
 *
 * Everything else in that row is a place to go. This is a thing to do, which is
 * why it sits behind a divider and wears a count rather than a badge: the other
 * badges are percentages and totals that can never reach zero, and a number
 * that never clears is one people stop reading. Every alert here has an action
 * that removes it.
 *
 * It sends nothing. Each alert routes to the screen that owns the decision --
 * anything client-facing goes to the Client Portal tab -- so the figures are
 * checked in place and a human presses Release. The publish controls stay the
 * only path to a client.
 */

interface Props {
  projectId?: string;
  projectContext: any;
  onGoTo: (route: string) => void;
}

const TONE: Record<string, { chip: string; dot: string }> = {
  portal: { chip: 'bg-rose-50 text-rose-700 border-rose-100', dot: 'bg-rose-500' },
  client: { chip: 'bg-amber-50 text-amber-800 border-amber-100', dot: 'bg-amber-500' },
  money:  { chip: 'bg-[#EDE8F5] text-[#3D52A0] border-[#ADBBDA]/50', dot: 'bg-[#3D52A0]' },
};

/** Brushed metal, with the clapper lagging the body the way a real one does. */
const Bell: React.FC<{ hot: boolean; ringing: boolean }> = ({ hot, ringing }) => (
  <svg width="26" height="26" viewBox="0 0 44 44" aria-hidden="true" className="block">
    <defs>
      <linearGradient id="hab-body" x1="14%" y1="4%" x2="86%" y2="96%">
        <stop offset="0" stopColor="#E8ECF7" />
        <stop offset="52%" stopColor="#A9B4D4" />
        <stop offset="100%" stopColor="#5C6894" />
      </linearGradient>
      <radialGradient id="hab-sheen" cx="32%" cy="22%" r="52%">
        <stop offset="0" stopColor="#fff" stopOpacity=".75" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <filter id="hab-drop" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#12182F" floodOpacity=".3" />
      </filter>
    </defs>
    <g filter="url(#hab-drop)">
      <g className={ringing ? 'hab-swing-fast' : hot ? 'hab-swing' : undefined}>
        <circle cx="22" cy="6.4" r="2.7" fill="url(#hab-body)" />
        <path d="M22 8C15 8 9.5 13.5 9.5 20.5V27L6 32.5h32L34.5 27v-6.5C34.5 13.5 29 8 22 8Z" fill="url(#hab-body)" />
        <path d="M22 8C15 8 9.5 13.5 9.5 20.5V27L6 32.5h32L34.5 27v-6.5C34.5 13.5 29 8 22 8Z" fill="url(#hab-sheen)" />
        <path d="M15 14.5c1.6-3 4.2-4.7 7-4.9" stroke="#fff" strokeOpacity=".7" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      </g>
      <g className={ringing ? 'hab-clap-fast' : hot ? 'hab-clap' : undefined}>
        <circle cx="22" cy="36" r="3.1" fill="url(#hab-body)" />
        <circle cx="21" cy="35" r="1.1" fill="#fff" fillOpacity=".6" />
      </g>
    </g>
  </svg>
);

export default function HubAlertsBell({ projectId, projectContext, onGoTo }: Props) {
  const [view, setView] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [ringing, setRinging] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const known = useRef<string>('');

  /* The client's stored copy, which is half of every comparison below. */
  useEffect(() => {
    let alive = true;
    if (!projectId) { setView(null); return; }
    readPortalView(projectId).then(v => { if (alive) setView(v); }).catch(() => {});
    return () => { alive = false; };
  }, [projectId, projectContext]);

  const alerts = useMemo(
    () => buildHubAlerts({ context: projectContext, view }).filter(a => !dismissed.includes(a.id)),
    [projectContext, view, dismissed],
  );

  /* Ring once when something genuinely new turns up, never on a re-render. */
  useEffect(() => {
    const key = alerts.map(a => a.id).join('|');
    if (key && key !== known.current && known.current !== '') {
      setRinging(true);
      const t = setTimeout(() => setRinging(false), 2200);
      return () => clearTimeout(t);
    }
    known.current = key;
  }, [alerts]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const n = alerts.length;
  const hot = n > 0;

  return (
    <>
      <style>{`
        @keyframes habSwing{0%,62%,100%{transform:rotate(0)}8%{transform:rotate(15deg)}
          18%{transform:rotate(-12deg)}28%{transform:rotate(8.5deg)}38%{transform:rotate(-5deg)}
          48%{transform:rotate(2.5deg)}55%{transform:rotate(-1deg)}}
        @keyframes habClap{0%,62%,100%{transform:translateX(0)}10%{transform:translateX(3.4px)}
          20%{transform:translateX(-3px)}30%{transform:translateX(2px)}40%{transform:translateX(-1.2px)}}
        @keyframes habHalo{0%{transform:scale(.55);opacity:.5}75%{transform:scale(1.7);opacity:0}100%{opacity:0}}
        @keyframes habPop{0%{transform:scale(0) rotate(-25deg)}62%{transform:scale(1.2) rotate(6deg)}
          100%{transform:scale(1) rotate(0)}}
        .hab-swing{transform-origin:50% 13%;animation:habSwing 4.6s cubic-bezier(.36,.07,.19,.97) infinite}
        .hab-clap{transform-origin:50% 8%;animation:habClap 4.6s cubic-bezier(.36,.07,.19,.97) infinite}
        .hab-swing-fast{transform-origin:50% 13%;animation:habSwing 1.05s cubic-bezier(.36,.07,.19,.97) 2}
        .hab-clap-fast{transform-origin:50% 8%;animation:habClap 1.05s cubic-bezier(.36,.07,.19,.97) 2}
        .hab-halo{animation:habHalo 2.8s ease-out infinite}
        .hab-halo-2{animation:habHalo 2.8s ease-out 1.4s infinite}
        .hab-badge{animation:habPop .42s cubic-bezier(.22,1.4,.36,1)}
        .hab-stage{transition:transform .35s cubic-bezier(.22,1,.36,1)}
        .hab-btn:hover .hab-stage{transform:rotateX(14deg) rotateY(-14deg) translateZ(8px)}
        @media (prefers-reduced-motion:reduce){
          .hab-swing,.hab-clap,.hab-swing-fast,.hab-clap-fast,.hab-halo,.hab-halo-2,.hab-badge{animation:none!important}
          .hab-btn:hover .hab-stage{transform:none}
        }
      `}</style>

      <div className="flex items-center shrink-0">
        <span className="w-px self-stretch bg-slate-300/70 mx-2" aria-hidden="true" />
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          title={hot ? `${n} waiting on you` : 'Nothing waiting on you'}
          aria-label={hot ? `${n} alerts` : 'No alerts'}
          aria-expanded={open}
          className={`hab-btn relative flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl border transition-colors cursor-pointer ${
            open ? 'bg-[#EDE8F5] border-[#3D52A0]/40' : 'border-transparent hover:bg-slate-200/60'
          }`}
          style={{ perspective: 420 }}
        >
          <span className="hab-stage relative block" style={{ transformStyle: 'preserve-3d' }}>
            {hot && (
              <>
                <span className="hab-halo absolute -inset-1.5 rounded-full border-2 border-rose-500 pointer-events-none" />
                <span className="hab-halo-2 absolute -inset-1.5 rounded-full border-2 border-rose-500 pointer-events-none" />
              </>
            )}
            <Bell hot={hot} ringing={ringing} />
            {hot && (
              <span className="hab-badge absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-extrabold grid place-items-center tabular-nums border-2 border-slate-100">
                {n}
              </span>
            )}
          </span>
          <span className={`text-[9px] font-extrabold uppercase tracking-wider ${hot ? 'text-rose-700' : 'text-slate-400'}`}>
            {hot ? 'Waiting' : 'Clear'}
          </span>
        </button>
      </div>

      {open && at && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: at.top, right: at.right, width: 'min(420px, calc(100vw - 24px))', zIndex: 9998 }}
          className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-slate-900">Waiting on you</p>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                {projectContext?.name || 'This project'}
                {projectContext?.clientName ? ` · ${projectContext.clientName}` : ''}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Close
            </button>
          </div>

          {n === 0 ? (
            <div className="px-5 py-9 text-center">
              <p className="text-[13px] font-extrabold text-slate-800">Nothing waiting on you</p>
              <p className="text-[11.5px] text-slate-500 font-medium mt-1">
                Their portal matches this project.
              </p>
            </div>
          ) : (
            <div className="max-h-[min(420px,60vh)] overflow-y-auto">
              {alerts.map(a => {
                const tone = TONE[a.kind] || TONE.portal;
                return (
                  <div key={a.id} className="flex gap-3 px-4 py-3.5 border-b border-slate-100 last:border-b-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${tone.dot}`} />
                    <div className="min-w-0 flex-1">
                      <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone.chip}`}>
                        {a.label}
                      </span>
                      <p className="text-[12.5px] font-extrabold text-slate-900 leading-snug mt-1.5">{a.title}</p>
                      <p className="text-[11.5px] text-slate-600 font-medium mt-0.5">{a.detail}</p>
                      {a.when && <p className="text-[10px] text-slate-400 font-bold mt-1">{a.when}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button
                          onClick={() => { setOpen(false); onGoTo(a.goTo); }}
                          className="text-[11px] font-extrabold px-2.5 py-1.5 rounded-lg bg-[#3D52A0] text-white hover:bg-[#334486] transition-colors cursor-pointer"
                        >
                          {a.cta}
                        </button>
                        <button
                          onClick={() => setDismissed(d => [...d, a.id])}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/*
            Said out loud, because the whole point of this panel is that it does
            not touch the client. Nothing above sends; every button opens the
            screen where a person decides.
          */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
            <p className="text-[10.5px] text-slate-500 font-semibold">
              Nothing here is sent to your client. Review it, then release from the Client Portal tab.
            </p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
