import React from "react";
import { ArrowRight } from "lucide-react";
import BoomerangVideoBg from "./BoomerangVideoBg";

/**
 * FFDS BOQ COPILOT — public landing page.
 *
 * One composition, in the spirit of the reference: brand, headline, one
 * sentence, one call to action, a full-bleed moving background, and a single
 * glass panel anchored to the bottom of the first viewport. Nothing else
 * competes for the eye and the only motions are the boomerang loop and 200ms
 * colour transitions.
 *
 * The video source is a prop. Drop a studio film at /hero.mp4 and it plays;
 * until then the background falls back to a quiet moving wash rather than
 * showing a broken frame.
 */

const INK = "#191919";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
  { label: "Studio", href: "#studio" },
];

const PILLARS = [
  { n: "01", label: "Estimate" },
  { n: "02", label: "Execute" },
  { n: "03", label: "Account for" },
];

interface Props {
  onEnter?: () => void;
  videoSrc?: string;
}

const LandingPage: React.FC<Props> = ({ onEnter, videoSrc = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_090628_7052d8a6-a094-4341-a4a2-ad58493a67a9.mp4" }) => {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden" style={{ color: INK }}>
      {/* ── Fixed, transparent navbar ─────────────────────────────────── */}
      {/* Absolute, not fixed. The spec keeps the bar transparent with no blur,
          which only works while nothing scrolls beneath it; once the section can
          grow, a fixed bar has the headline sliding through the links. Anchored
          to the hero it stays transparent and simply scrolls away. */}
      <nav className="absolute top-0 left-0 right-0 z-50 px-6 sm:px-10 md:px-14 py-4 sm:py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* FFDS mark, drawn rather than imported so the landing page has no
                dependency on org context before sign-in. */}
            <svg viewBox="0 0 256 256" className="w-6 h-6" fill="currentColor" style={{ color: INK }}>
              <path d="M 144 256 L 27.598 256 L 144 139.598 Z" />
              <path d="M 256 207.5 L 200 256 L 200 56 L 0 56 L 48 0 L 256 0 Z" />
              <path d="M 0 204.402 L 0 112 L 92.402 112 Z" />
            </svg>
            <span className="font-semibold text-base tracking-tight" style={{ color: INK }}>
              Form Factors
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm transition-colors duration-200"
                style={{ color: `${INK}B3` }}
                onMouseEnter={(e) => (e.currentTarget.style.color = INK)}
                onMouseLeave={(e) => (e.currentTarget.style.color = `${INK}B3`)}
              >
                {l.label}
              </a>
            ))}
          </div>

          <button
            onClick={onEnter}
            className="px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors duration-200"
            style={{ backgroundColor: INK }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2b2b2b")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = INK)}
          >
            Open the studio
          </button>
        </div>
      </nav>

      {/* ── Hero: exactly one viewport ────────────────────────────────── */}
      {/* min-h-screen, not h-screen: on a tall display mt-auto still pins the
          panel to the fold, but on a 700px laptop the composition grows and
          scrolls instead of clipping the panel in half. */}
      <section className="relative flex flex-col items-center overflow-hidden min-h-screen">
        <BoomerangVideoBg src={videoSrc} />

        {/* Keeps the headline readable over any footage. */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-white/70 via-white/40 to-white/80 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center pt-20 sm:pt-24 md:pt-28 px-4 sm:px-6">
          <h1
            className="font-serif text-4xl sm:text-5xl md:text-7xl lg:text-8xl leading-[1.1] tracking-tighter font-normal"
            style={{ color: INK }}
          >
            Build lasting
            <br />
            relationships.
          </h1>

          <p
            className="max-w-sm sm:max-w-md mt-4 sm:mt-5 md:mt-6 text-sm md:text-base leading-relaxed"
            style={{ color: `${INK}B3` }}
          >
            The operating system for interior design studios &mdash; one place to price
            the work, run the site, and show every client exactly where their money went.
          </p>

          <button
            onClick={onEnter}
            className="mt-5 sm:mt-6 md:mt-7 px-6 sm:px-8 py-3 sm:py-3.5 text-white text-sm font-medium rounded-lg transition-colors duration-200"
            style={{ backgroundColor: INK }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2b2b2b")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = INK)}
          >
            Open the studio
          </button>
        </div>

        {/* ── Bottom panel, flush to the fold ─────────────────────────── */}
        <div className="relative z-10 mt-auto pt-10 w-full max-w-5xl px-4 sm:px-6">
          <div className="bg-white/90 backdrop-blur-sm border border-gray-200 border-b-0 pt-7 sm:pt-9 md:pt-11 px-5 sm:px-8 md:px-12 pb-0 shadow-sm">
            <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-16">
              <div>
                <p
                  className="text-[11px] uppercase tracking-[0.2em] font-medium"
                  style={{ color: `${INK}80` }}
                >
                  What do we do?
                </p>
                <h2
                  className="mt-3 text-2xl sm:text-3xl md:text-4xl font-serif font-normal leading-tight tracking-tight"
                  style={{ color: INK }}
                >
                  Estimates that survive
                  <br className="hidden sm:block" /> contact with the site
                </h2>
              </div>

              <div className="flex items-end">
                <p
                  className="text-sm md:text-[15px] leading-relaxed"
                  style={{ color: `${INK}B3` }}
                >
                  A BOQ that becomes the contract, the purchase orders and the final
                  account without being retyped. Margin you can see while the job is
                  still running, not after it has closed.
                </p>
              </div>
            </div>

            <div className="mt-5 sm:mt-6 md:mt-8 h-px bg-gray-200 w-full" />

            <div className="grid sm:grid-cols-3 gap-2 sm:gap-3 py-5 sm:py-6">
              {PILLARS.map((p) => (
                <button
                  key={p.n}
                  onClick={onEnter}
                  className="group bg-[#F4F3F3] hover:bg-[#eaeaea] transition-all duration-200 cursor-pointer px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between text-left"
                >
                  <span className="text-sm">
                    <span style={{ color: `${INK}66` }}>{p.n}</span>
                    <span className="mx-2" style={{ color: `${INK}4D` }}>/</span>
                    <span className="font-medium" style={{ color: INK }}>{p.label}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 group-hover:translate-x-0.5 transition-all duration-200" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
