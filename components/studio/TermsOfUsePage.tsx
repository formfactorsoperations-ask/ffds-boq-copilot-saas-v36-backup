import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, KeyRound, Sparkles, ClipboardCheck, Info } from "lucide-react";

/**
 * TERMS OF USE.
 *
 * A conduct policy for the studio's own team, not a contract. That distinction
 * was a decision, not an oversight: it deliberately states no governing law and
 * no jurisdiction, so it commits the studio to nothing and binds nobody. It
 * says how this system is to be used and why, which is the thing people
 * actually need.
 *
 * It does not cover clients. They log into the portal too, but what governs
 * their side is already signed -- the terms docket and the execution
 * agreement -- and a page like this has no business restating or contradicting
 * a live contract.
 *
 * Replaced a footer link called "Contract terms" that pointed at the Studio
 * Settings panel holding default clause wordings. In a footer those words read
 * as Terms of Service, which is an entirely different thing from the studio's
 * boilerplate for client agreements.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";

interface Clause {
  icon: React.ElementType;
  title: string;
  body: string[];
}

const CLAUSES: Clause[] = [
  {
    icon: Lock,
    title: "Everything here is client-confidential",
    body: [
      "Briefs, drawings, costs, margins, contracts and site records belong to the client whose project they sit in. Treat all of it as confidential by default.",
      "Do not export, forward, screenshot or discuss studio or client data outside the studio without authorisation from the project lead.",
      "Margins, vendor rates and internal costs are never shared with a client. The client-facing views exist so that what a client sees is a deliberate choice.",
    ],
  },
  {
    icon: KeyRound,
    title: "Your account is yours alone",
    body: [
      "Accounts are personal. Do not share credentials, and do not let someone work under your login because it is quicker.",
      "Every sign-off, status change and approval is recorded against the account that made it. Shared logins make that record worthless.",
      "When someone leaves the studio, their access is removed. Flag it rather than assuming it has been handled.",
    ],
  },
  {
    icon: Sparkles,
    title: "AI runs on the studio's account",
    body: [
      "AI features spend the studio's own quota. They are there to be used, but every request has a cost attached to the practice.",
      "Prompt text is sent to Google for processing. Do not paste anything into an AI field that should not leave the studio.",
      "AI output is a draft. Quantities, prices and clauses it produces are checked by a person before they reach a client.",
    ],
  },
  {
    icon: ClipboardCheck,
    title: "What you enter is relied on",
    body: [
      "Figures, sign-offs and site records entered here drive client billing, contracts and payment releases. They are not notes.",
      "Do not mark a stage complete, a document signed or a payment received before it is true. Downstream work unlocks on those flags.",
      "If something was entered wrongly, correct it and say so. A wrong figure found late costs more than an awkward correction found early.",
    ],
  },
];

const TermsOfUsePage: React.FC = () => {
  const reduce = !!useReducedMotion();
  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduce ? 0 : 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <div className="px-4 pb-10 max-w-[1000px]">
      <motion.p {...rise(0)} className="text-[10.5px] font-bold uppercase tracking-[0.28em]" style={{ color: BRAND }}>
        How we use this system
      </motion.p>
      <motion.p {...rise(1)} className="mt-3 text-[14px] leading-relaxed text-slate-600 max-w-[64ch]">
        Four things the studio expects of anyone working in Studio Copilot.
        Short, because the point is that people read it.
      </motion.p>

      <motion.p
        {...rise(2)}
        className="mt-6 flex items-start gap-2.5 text-[12.5px] leading-relaxed text-slate-500 bg-[#F4F6FC] border border-[#E4E8F3] rounded-2xl px-4 py-3 max-w-[70ch]"
      >
        <Info className="w-4 h-4 shrink-0 mt-[1px]" strokeWidth={2.2} style={{ color: BRAND }} />
        <span>
          This is an internal conduct policy for studio staff. It is not a
          contract, it states no governing law, and it does not cover clients
          &mdash; what governs a client&rsquo;s side is the terms docket and
          execution agreement they have signed for their project.
        </span>
      </motion.p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {CLAUSES.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.section
              key={c.title}
              {...rise(3 + i)}
              className="bg-white rounded-3xl border border-slate-200/70 p-6"
            >
              <h2 className="text-[15px] font-bold tracking-tight flex items-start gap-2.5" style={{ color: INK }}>
                <span className="w-8 h-8 shrink-0 rounded-xl bg-[#F1F4FB] flex items-center justify-center" style={{ color: BRAND }}>
                  <Icon className="w-4 h-4" strokeWidth={2.2} />
                </span>
                <span className="mt-1">{c.title}</span>
              </h2>
              <ul className="mt-4 space-y-2.5">
                {c.body.map((line, n) => (
                  <li key={n} className="flex items-start gap-2.5 text-[12.5px] text-slate-500 leading-relaxed">
                    <span aria-hidden className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: "#ADBBDA" }} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          );
        })}
      </div>

      <motion.p {...rise(7)} className="mt-6 text-[11.5px] text-slate-400 leading-relaxed max-w-[70ch]">
        Questions about any of this go to the project lead. If something here
        stops matching how the studio actually works, it should be changed
        rather than quietly ignored.
      </motion.p>
    </div>
  );
};

export default TermsOfUsePage;
