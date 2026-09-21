import React, { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  MapPin, ShieldCheck, LayoutGrid, HardHat, PencilRuler, Truck, Copyright, FileText,
  Lock, LifeBuoy, Home,
  Table2, Layers, ReceiptIndianRupee, TrendingUp,
  MonitorSmartphone, Camera, BadgeCheck, Activity, Users, IndianRupee,
} from "lucide-react";
import { formatCompactINR } from "../../lib/utils";
import { useOrg } from "../../contexts/OrgContext";

/**
 * STUDIO FOOTER.
 *
 * The page's closing statement: what this system is for, what it does, and
 * what is in it right now.
 *
 * Built to a supplied reference, on the app's own light ground rather than the
 * reference's dark one -- and in the app's own typeface rather than the
 * reference's serif.
 *
 * The first pass did set the headline in Playfair and the eyebrow in mono, and
 * that was wrong for an internal screen. `.font-serif` and `.font-mono` are
 * both on the exemption list of the body.font-choice-* rules in index.html,
 * which is how a studio picks the face the whole app runs in. Anything wearing
 * those classes stops listening to that setting. The serif is right on the
 * client-facing collateral that uses it -- proposals, testimonials, signature
 * dockets, audit certificates -- because those are documents. This is a home
 * screen, so the hierarchy is carried by size, weight, tracking and colour
 * instead, which is how every other label in this app is built.
 *
 * Carried over from the reference:
 *
 *  - The capability columns. Every item named here was checked against the
 *    codebase before being printed -- GST invoicing, the warranty vault, the
 *    BOQ editor, procurement and snags all exist. A footer advertising a
 *    feature the product does not have is a lie with a nice typeface.
 *
 * The items are descriptive, not links: almost all of them live inside a
 * project workspace and cannot be reached from here without one open. The
 * column HEADINGS navigate, because those map to real top-level destinations.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";

/**
 * The light on the colophon plate.
 *
 * No tilt -- the plate stays flat. What follows the cursor is the highlight
 * alone, which is enough to make the surface read as lit rather than printed,
 * without the footer turning as you pass over it on the way to the bottom of
 * the page.
 *
 * Bound to the pointer rather than a timer, deliberately: a sheen on a clock
 * is the template flourish that was removed from the project cards, and it
 * would be no better here.
 */
const usePlateLight = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = !!useReducedMotion();

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduce) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--py", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    el.style.setProperty("--sheen", "1");
  };

  const onMouseLeave = () => {
    ref.current?.style.setProperty("--sheen", "0");
  };

  return { ref, onMouseMove, onMouseLeave };
};

interface Item {
  label: string;
  icon: React.ElementType;
}

interface Column {
  heading: string;
  /** Top-level tab this column's heading goes to, when there is one. */
  tab?: string;
  items: Item[];
}

interface Props {
  /**
   * `full` is the home screen: statement, capabilities, vitals, plate.
   * `slim` is every working screen: the plate alone.
   *
   * The working screens do not get the rest on purpose. The capability columns
   * navigate to Projects, Clients and Reports -- which on those very pages
   * would be links to where you already are -- and the statement would repeat
   * itself five times. A page you open in order to do something should not end
   * in eight hundred pixels of prose.
   */
  variant?: "full" | "slim";
  onNavigate?: (tab: string) => void;
  studioName?: string;
  /** Real figures, from the same hook the home page reads. `full` only. */
  activeCount?: number;
  clientsCount?: number;
  openValue?: number;
}

const COLUMNS: Column[] = [
  {
    heading: "Studio operations",
    tab: "projects",
    items: [
      { label: "Projects overview", icon: LayoutGrid },
      { label: "Active site matrix", icon: HardHat },
      { label: "Drawings tracker", icon: PencilRuler },
      { label: "Vendor procurement", icon: Truck },
    ],
  },
  {
    heading: "Financial engine",
    tab: "reports",
    items: [
      { label: "Master BOQ matrix", icon: Table2 },
      { label: "Three-tier proposal pricing", icon: Layers },
      { label: "Tax invoicing (GST)", icon: ReceiptIndianRupee },
      { label: "Cashflow projections", icon: TrendingUp },
    ],
  },
  {
    heading: "Client experience",
    tab: "clients",
    items: [
      { label: "Live client portal", icon: MonitorSmartphone },
      { label: "Daily site snapshots", icon: Camera },
      { label: "Milestone approvals", icon: BadgeCheck },
      { label: "Digital warranty vault", icon: ShieldCheck },
    ],
  },
];

const StudioFooter: React.FC<Props> = ({
  variant = "full",
  onNavigate,
  studioName = "Form Factors Design Studio",
  activeCount = 0,
  clientsCount = 0,
  openValue = 0,
}) => {
  const { orgData } = useOrg();
  const plate = usePlateLight();
  /* The studio's own profile, not a string from a mockup. cityState is edited
     in Studio Settings and already drives the address on client documents, so
     the footer says wherever the studio actually is -- and says nothing at all
     if that field is blank, rather than inventing offices. */
  const studio = orgData?.orgName || studioName;
  const where = (orgData?.cityState || "").trim();
  /* The studio's real mark, set in Studio Settings and stored as a data URI.
     Falls back to a house icon rather than an empty box when none is set. */
  const logo = (orgData?.orgLogo || "").trim();

  const reduce = !!useReducedMotion();
  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduce ? 0 : 0.06 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  });

  const isSlim = variant === "slim";

  return (
    <footer
      className={
        isSlim
          ? "mt-10 pt-6 border-t border-slate-200/70"
          : "mt-14 pt-12 border-t border-slate-200/70"
      }
    >
      {!isSlim && (
      <>
      {/* ── Statement ─────────────────────────────────────────────────── */}
      <motion.p
        {...rise(0)}
        className="text-[10.5px] font-bold uppercase tracking-[0.28em]"
        style={{ color: BRAND }}
      >
        Form Factors Studio OS
      </motion.p>

      <motion.h2
        {...rise(1)}
        className="mt-4 text-[32px] sm:text-[40px] font-bold leading-[1.12] tracking-[-0.02em] max-w-[17ch]"
        style={{ color: INK }}
      >
        The studio&rsquo;s system of record.
      </motion.h2>

      <motion.p
        {...rise(2)}
        className="mt-5 max-w-[52ch] text-[14.5px] leading-relaxed text-slate-500"
      >
        Every brief, cost, drawing and signature the studio holds — from the
        first client conversation to the final handover.
      </motion.p>

      {/* ── Capabilities ──────────────────────────────────────────────── */}
      <div className="mt-12 pt-10 border-t border-slate-200/70 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
        {COLUMNS.map((col, i) => (
          <motion.div key={col.heading} {...rise(3 + i)}>
            {col.tab ? (
              <button
                type="button"
                onClick={() => onNavigate(col.tab!)}
                className="text-[11px] font-bold uppercase tracking-[0.14em] hover:underline underline-offset-4 cursor-pointer"
                style={{ color: BRAND }}
              >
                {col.heading}
              </button>
            ) : (
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: BRAND }}
              >
                {col.heading}
              </p>
            )}
            <ul className="mt-5 space-y-3">
              {col.items.map((it) => {
                const Icon = it.icon;
                return (
                  <li
                    key={it.label}
                    className="flex items-start gap-2.5 text-[13.5px] text-slate-600 leading-snug"
                  >
                    <Icon
                      className="w-3.5 h-3.5 shrink-0 mt-[3px] text-slate-400"
                      strokeWidth={2}
                    />
                    <span>{it.label}</span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        ))}

        {/* Studio vitals -- real numbers, labelled as what they actually are.
            The reference ran "Live Projects" straight into "42 Accounts",
            which reads as one figure and is two different things. */}
        <motion.div {...rise(6)}>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: BRAND }}
          >
            Studio vitals
          </p>
          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-[12.5px] text-slate-400 flex items-center gap-1.5"><Activity className="w-3 h-3 shrink-0" strokeWidth={2.2} />Live projects</dt>
              <dd className="text-[19px] font-bold tabular-nums mt-0.5" style={{ color: INK }}>
                {activeCount}
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-slate-400 flex items-center gap-1.5"><Users className="w-3 h-3 shrink-0" strokeWidth={2.2} />Client accounts</dt>
              <dd className="text-[19px] font-bold tabular-nums mt-0.5" style={{ color: INK }}>
                {clientsCount}
              </dd>
            </div>
            <div>
              {/* "Open value", not "under management".

                  openValue is active + pipeline. The Clients screen already
                  uses the words "under management" for a different scope --
                  every client-attributable project, 3.01Cr against this 3.81Cr
                  -- so borrowing the label here would have put two screens in
                  contradiction over one phrase. "Open value" is this app's own
                  existing term for exactly this figure. */}
              <dt className="text-[12.5px] text-slate-400 flex items-center gap-1.5"><IndianRupee className="w-3 h-3 shrink-0" strokeWidth={2.2} />Open value</dt>
              <dd className="text-[19px] font-bold tabular-nums mt-0.5" style={{ color: INK }}>
                {formatCompactINR(openValue)}
              </dd>
            </div>
          </dl>
        </motion.div>
      </div>

      </>
      )}

      {/* ── Colophon ───────────────────────────────────────────────────

          A plate rather than a line of text: it settles into place on mount and
          carries a highlight that follows the cursor, as though a fixed light
          were on it. It does not tilt. */}
      <motion.div
        className={isSlim ? "" : "mt-12"}
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : isSlim ? 0.05 : 0.42, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          ref={plate.ref}
          onMouseMove={plate.onMouseMove}
          onMouseLeave={plate.onMouseLeave}
          className="relative overflow-hidden rounded-2xl border border-slate-200/70 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            background: "linear-gradient(135deg, #FFFFFF 0%, #F4F6FC 100%)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
          }}
        >
          {/* The light. Sits where the cursor is, fades out when it leaves. */}
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: "var(--sheen, 0)" as any,
              background:
                "radial-gradient(circle 340px at var(--px, 50%) var(--py, 50%), rgba(61, 82, 160, 0.14), transparent 62%)",
            }}
          />

          <div className="min-w-0 relative">
            {/* The mark returns you home.

                A footer is where people land when they have scrolled to the
                bottom of something and are done with it, so the way back to the
                start belongs here. Clicking the studio's own logo to get home is
                the convention people already carry in from every website they
                use; this just honours it. */}
            <button
              type="button"
              onClick={() => onNavigate?.("home")}
              disabled={!onNavigate}
              title="Back to home"
              aria-label="Back to home"
              className="group inline-flex items-center gap-2 text-left disabled:cursor-default cursor-pointer"
            >
              <span className="w-7 h-7 shrink-0 rounded-lg border border-slate-200/80 bg-white flex items-center justify-center overflow-hidden group-hover:border-[#ADBBDA] transition-colors">
                {logo ? (
                  <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
                ) : (
                  <Home className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#3D52A0] transition-colors" strokeWidth={2.2} />
                )}
              </span>
              <span
                className="text-[12.5px] font-bold tracking-tight truncate group-hover:text-[#3D52A0] transition-colors"
                style={{ color: INK }}
              >
                {studio}
              </span>
            </button>
            <p className="text-[11.5px] text-slate-400 mt-1 ml-9 flex items-center gap-x-1.5 gap-y-0.5 flex-wrap">
              {where && (
                <>
                  <MapPin className="w-3 h-3 shrink-0" strokeWidth={2.4} />
                  <span className="truncate">{where}</span>
                  <span aria-hidden className="text-slate-300">&bull;</span>
                </>
              )}
              <Copyright className="w-3 h-3 shrink-0" strokeWidth={2.2} />
              <span>{new Date().getFullYear()}</span>
              <span aria-hidden className="text-slate-300">&bull;</span>
              <span>All rights reserved. Proprietary enterprise OS.</span>
            </p>
          </div>

          {/* All three now go somewhere. Data Privacy and Support Desk were
              held back until the pages behind them existed -- a footer link
              that goes nowhere is the same mistake as a city the studio does
              not have an office in. */}
          {onNavigate && (
            <div className="relative shrink-0 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {(
                [
                  { label: "Data privacy", tab: "data-privacy", icon: Lock },
                  { label: "Terms of use", tab: "terms-of-use", icon: FileText },
                  { label: "Support desk", tab: "support", icon: LifeBuoy },
                ] as const
              ).map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.tab}
                    type="button"
                    onClick={() => onNavigate(l.tab)}
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 hover:text-[#3D52A0] transition-colors cursor-pointer"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                    {l.label}
                  </button>
                );
              })}
            </div>
          )}

          <span
            className="relative shrink-0 self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-400 inline-flex items-center gap-1.5"
            title="This workspace and everything in it is internal to the studio"
          >
            <ShieldCheck className="w-3 h-3 shrink-0" strokeWidth={2.4} />
            Confidential internal system
          </span>
        </div>
      </motion.div>
    </footer>
  );
};

export default StudioFooter;
