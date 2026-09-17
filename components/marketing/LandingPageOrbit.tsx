import React from "react";
import { ArrowRight, MousePointer2 } from "lucide-react";
import { INITIAL_BANK } from "../../constants";

/**
 * FFDS BOQ COPILOT — public landing page, ORBIT VARIANT.
 *
 * A second composition, sitting alongside LandingPage.tsx rather than
 * replacing it. Neither imports the other; showing one has no effect on the
 * other. `?landing=orbit` picks this one.
 *
 * What carries over from the reference layout: the concentric rotating rings
 * with nodes riding them, the typewriter headline, the rotating conic border
 * on the buttons, the count-up, and the ticker strip.
 *
 * What does NOT carry over:
 *
 *  - The violet palette. Everything here is the studio's own brand blue, gold
 *    and ink, and the type is the app's own Outfit / Plus Jakarta Sans rather
 *    than the reference's Urbanist / Inter.
 *
 *  - The nine avatar photographs and five partner-logo SVGs. Those are other
 *    people's images and other companies' brand marks, hosted on someone
 *    else's site. The rings carry the studio's own trades instead.
 *
 *  - The "20k+ Specialists" counter. Numbers on a public page have to be true,
 *    so the counter reads the rate bank that actually ships with the product
 *    and the ring nodes carry that bank's real per-trade counts. If an item is
 *    added to constants.ts, this page's number moves with it.
 */

/* Derived, never hand-typed: the page cannot drift from the bank it describes. */
const TRADE_COUNTS = INITIAL_BANK.reduce<Record<string, number>>((acc, item) => {
  const cat = (item as any).cat as string;
  if (cat) acc[cat] = (acc[cat] || 0) + 1;
  return acc;
}, {});

const TRADES = Object.entries(TRADE_COUNTS).sort((a, b) => b[1] - a[1]);
const BANK_TOTAL = INITIAL_BANK.length;

const INK = "#0A1B33";
const BRAND = "#3D52A0";
const GOLD = "#B5945B";

/* Accents stay inside the studio's own range — blues, gold, and the tones
   already used for good/caution elsewhere in the app. */
const ACCENTS = [
  "#3D52A0", "#B5945B", "#0E7C5A", "#1D4ED8", "#C77700", "#0F766E",
  "#4A9BE4", "#8A6D3B", "#2563EB", "#3FAE87", "#946A00",
];

/** Ring geometry, innermost first. Radius is half the diameter. */
const RINGS = [
  { d: 353, dur: "30s", dir: "lpo-orbit-ccw", anti: "lpo-upright-cw",  gold: false },
  { d: 501, dur: "40s", dir: "lpo-orbit-cw",  anti: "lpo-upright-ccw", gold: true  },
  { d: 649, dur: "50s", dir: "lpo-orbit-cw",  anti: "lpo-upright-ccw", gold: false },
  { d: 797, dur: "60s", dir: "lpo-orbit-ccw", anti: "lpo-upright-cw",  gold: true  },
];

/** Which ring each trade rides, and at what angle. */
const PLACEMENT: { ring: number; angle: number }[] = [
  { ring: 0, angle: 270 }, { ring: 0, angle: 90 },
  { ring: 1, angle: 60 }, { ring: 1, angle: 180 }, { ring: 1, angle: 300 },
  { ring: 2, angle: 20 }, { ring: 2, angle: 130 }, { ring: 2, angle: 250 },
  { ring: 3, angle: 30 }, { ring: 3, angle: 160 }, { ring: 3, angle: 290 },
];

const NAV = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
  { label: "Studio", href: "#studio" },
];

const HEAD_A = "Estimates that survive contact with the site";
const HEAD_B = " — priced, frozen, and accounted for.";
const HEADLINE = HEAD_A + HEAD_B;

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_090628_7052d8a6-a094-4341-a4a2-ad58493a67a9.mp4";

/* ── Count-up ─────────────────────────────────────────────────────────────
   easeOutCubic, so the number decelerates into its final value instead of
   stopping dead. Driven by rAF rather than setInterval so it stays on the
   compositor's clock and pauses with the tab. */
const useCountUp = (target: number, ms = 2000, delay = 1200) => {
  const [n, setN] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, [target, ms, delay]);

  return n;
};

/* ── Typewriter ─────────────────────────────────────────────────────────── */
const Typewriter: React.FC<{ text: string; splitAt: number; speed?: number; delay?: number }> = ({
  text,
  splitAt,
  speed = 35,
  delay = 400,
}) => {
  const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const [n, setN] = React.useState(reduce ? text.length : 0);

  React.useEffect(() => {
    if (reduce) return;
    let i = 0;
    let timer = 0;
    const start = window.setTimeout(function step() {
      i += 1;
      setN(i);
      if (i < text.length) timer = window.setTimeout(step, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
    };
  }, [text, speed, delay, reduce]);

  const done = n >= text.length;

  return (
    <span>
      <span style={{ color: INK }}>{text.slice(0, Math.min(n, splitAt))}</span>
      <span style={{ color: BRAND }}>{n > splitAt ? text.slice(splitAt, n) : ""}</span>
      {!done && (
        <span
          aria-hidden
          className="inline-block w-[3px] align-baseline"
          style={{ background: BRAND, height: "0.9em", animation: "lpo-blink 1s step-end infinite" }}
        />
      )}
    </span>
  );
};

interface Props {
  onEnter?: () => void;
  videoSrc?: string;
}

const LandingPageOrbit: React.FC<Props> = ({ onEnter, videoSrc = VIDEO_SRC }) => {
  const count = useCountUp(BANK_TOTAL);

  const pill =
    "relative z-10 inline-flex items-center gap-2 rounded-[50px] text-white font-semibold overflow-hidden transition-colors duration-300";

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden font-sans"
      style={{ background: "#F6F8FB", color: INK }}
    >
      {/* ── Video, recoloured to the studio's palette ────────────────────
          isolation:isolate keeps the blend layers working against the video
          rather than against whatever the page paints behind it. */}
      <div className="absolute inset-0 z-0 overflow-hidden" style={{ isolation: "isolate" }}>
        {/* Shows through if the CDN is unreachable — a failed <video> is
            transparent, so the page is never an empty box. */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#EAF1FA] via-white to-[#F3EFE6]" />
        <video
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          className="lpo-video relative w-full h-full object-cover"
        />
        <div className="lpo-duo-blue absolute inset-0 pointer-events-none" />
        <div className="lpo-duo-gold absolute inset-0 pointer-events-none" />
        {/* Lifts the type off the footage without flattening the whole frame. */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-white/85 via-white/35 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen max-w-[1920px] mx-auto">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header
          className="lpo-anim flex items-center justify-between px-6 sm:px-10 lg:px-16 py-5"
          style={{ animationName: "lpo-fade-down", animationDuration: "0.8s" }}
        >
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2.5">
              {/* Drawn, not fetched: the public page must not depend on org
                  context or a remote asset before anyone has signed in. */}
              <svg viewBox="0 0 256 256" className="w-6 h-6" fill="currentColor" style={{ color: INK }}>
                <path d="M 144 256 L 27.598 256 L 144 139.598 Z" />
                <path d="M 256 207.5 L 200 256 L 200 56 L 0 56 L 48 0 L 256 0 Z" />
                <path d="M 0 204.402 L 0 112 L 92.402 112 Z" />
              </svg>
              <span className="font-display font-semibold text-base tracking-tight">Form Factors</span>
            </div>

            <nav className="hidden lg:flex items-center gap-8">
              {NAV.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="group relative text-[15px]"
                  style={{ color: `${INK}B3` }}
                >
                  {l.label}
                  <span
                    className="absolute left-0 -bottom-1 h-px w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                    style={{ background: BRAND }}
                  />
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={onEnter}
              className="group relative hidden sm:inline text-[15px] font-medium"
              style={{ color: INK }}
            >
              Log in
              <span
                className="absolute left-0 -bottom-1 h-px w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                style={{ background: BRAND }}
              />
            </button>

            <div className="lpo-border-wrap">
              <button
                onClick={onEnter}
                className={`${pill} px-[26px] py-3 text-[15px]`}
                style={{ background: BRAND }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#334486")}
                onMouseLeave={(e) => (e.currentTarget.style.background = BRAND)}
              >
                Open the studio
              </button>
            </div>
          </div>
        </header>

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col xl:flex-row items-center gap-4 px-6 sm:px-10 lg:px-16">
          {/* Left */}
          <div
            className="lpo-anim flex-[0_1_620px] pt-2 xl:pt-6 w-full"
            style={{ animationName: "lpo-fade-up", animationDuration: "1s" }}
          >
            <h1
              className="font-display font-semibold tracking-[-1.5px] text-[32px] sm:text-[42px] lg:text-[50px] xl:text-[56px]"
              style={{ lineHeight: 1.04 }}
            >
              <Typewriter text={HEADLINE} splitAt={HEAD_A.length} />
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: `${INK}B3` }}>
              A BOQ that becomes the contract, the purchase orders and the final account
              without being retyped. Margin you can see while the job is still running,
              not after it has closed.
            </p>

            <div
              className="lpo-anim lpo-border-wrap inline-block mt-7"
              style={{ animationName: "lpo-fade-up", animationDuration: "0.7s", animationDelay: "3.2s" }}
            >
              <button
                onClick={onEnter}
                className={`${pill} px-7 py-3.5 text-[16px]`}
                style={{ background: BRAND }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#334486")}
                onMouseLeave={(e) => (e.currentTarget.style.background = BRAND)}
              >
                Start a project
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* A moment from inside the product, rather than a stock name tag. */}
            <div
              className="lpo-anim flex items-center gap-2 ml-[190px] sm:ml-[290px] mt-7"
              style={{ animationName: "lpo-fade-up", animationDuration: "0.6s", animationDelay: "3.6s" }}
            >
              <MousePointer2 className="w-5 h-5" style={{ color: BRAND, fill: BRAND }} />
              <span
                className="rounded-[20px] px-4 py-2 text-white text-[15px] font-medium"
                style={{ background: BRAND }}
              >
                BOQ frozen
              </span>
            </div>
          </div>

          {/* Right — rings */}
          <div
            className="lpo-anim relative flex-1 min-w-0 flex items-center justify-center"
            style={{ animationName: "lpo-scale-in", animationDuration: "1.2s", animationDelay: "0.3s" }}
          >
            <div className="lpo-stage-box lpo-stage-box--landing">
              <div className="lpo-stage">
              {RINGS.map((r, i) => (
                <div
                  key={i}
                  className={`lpo-orbit${r.gold ? " lpo-gold" : ""}`}
                  style={{
                    width: r.d,
                    height: r.d,
                    ["--lpo-dur" as any]: r.dur,
                    ["--lpo-dir" as any]: r.dir,
                  }}
                >
                  {/* Centre readout rides the innermost ring and counter-spins. */}
                  {i === 0 && (
                    <div
                      className="lpo-upright absolute inset-0 flex flex-col items-center justify-center"
                      style={{ ["--lpo-dur" as any]: r.dur, ["--lpo-anti" as any]: r.anti }}
                    >
                      <span
                        className="font-display text-[64px] font-medium leading-none tabular-nums"
                        style={{ color: INK }}
                      >
                        {count}
                      </span>
                      <span
                        className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] mt-2"
                        style={{ color: `${INK}99` }}
                      >
                        Priced line items
                      </span>
                      <span className="text-[12px] mt-1" style={{ color: `${INK}80` }}>
                        in the rate bank, ready to quote
                      </span>
                    </div>
                  )}

                  {PLACEMENT.map((p, idx) => {
                    if (p.ring !== i) return null;
                    const trade = TRADES[idx];
                    if (!trade) return null;
                    const [name, n] = trade;
                    const accent = ACCENTS[idx % ACCENTS.length];
                    return (
                      <div
                        key={name}
                        className="absolute top-1/2 left-1/2"
                        style={{
                          transform: `translate(-50%, -50%) rotate(${p.angle}deg) translate(${r.d / 2}px) rotate(${-p.angle}deg)`,
                        }}
                      >
                        <div
                          className="lpo-upright"
                          style={{ ["--lpo-dur" as any]: r.dur, ["--lpo-anti" as any]: r.anti }}
                        >
                          <div
                            className="lpo-anim flex items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur-sm pl-2.5 pr-3.5 py-2 whitespace-nowrap"
                            style={{
                              border: `1px solid ${accent}33`,
                              boxShadow: `0 10px 28px -10px ${accent}80`,
                              animationName: "lpo-chip-in",
                              animationDuration: "0.7s",
                              animationDelay: `${0.6 + idx * 0.16}s`,
                            }}
                          >
                            <span
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold tabular-nums"
                              style={{ background: `linear-gradient(140deg, ${accent}, ${accent}B3)` }}
                            >
                              {n}
                            </span>
                            <span className="text-[13px] font-semibold" style={{ color: INK }}>
                              {name}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Ticker ──────────────────────────────────────────────────────
            The reference scrolls other companies' logos. This scrolls what the
            studio actually prices, which is both honest and ours to show. */}
        <div
          className="lpo-anim lpo-ticker-mask relative w-full overflow-hidden py-5"
          style={{ animationName: "lpo-fade-up", animationDuration: "0.9s", animationDelay: "0.6s" }}
        >
          <div className="lpo-ticker-track flex items-center gap-14">
            {[...TRADES, ...TRADES].map(([name, n], i) => (
              <div key={`${name}-${i}`} className="flex items-center gap-3 shrink-0">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: i % 2 ? GOLD : BRAND }}
                />
                <span
                  className="font-display text-[15px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: `${INK}A6` }}
                >
                  {name}
                </span>
                <span className="text-[13px] tabular-nums" style={{ color: `${INK}66` }}>
                  {n}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPageOrbit;
