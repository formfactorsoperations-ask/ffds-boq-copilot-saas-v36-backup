import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Database, Cloud, Sparkles, ShieldCheck, Type as TypeIcon, EyeOff,
  MessageCircle, Image as ImageIcon, KeyRound, Users, FileText,
} from "lucide-react";

/**
 * DATA PRIVACY.
 *
 * A factual account of where this studio's data lives and what leaves the
 * building -- not a legal policy. Every claim on this page was read off the
 * codebase rather than written to sound reassuring:
 *
 *   - the Firestore collections are the ones the app actually opens
 *     (organizations, projects, studios, users);
 *   - the processor list is every external origin the source calls;
 *   - "no analytics" is a verified absence, not an assumption -- there is no
 *     gtag, mixpanel, posthog or sentry anywhere in the source;
 *   - the AI note describes the arrangement as it is today, after the Gemini
 *     key was moved out of the browser and behind a callable function.
 *
 * If any of that changes, this page has to change with it. It is deliberately
 * specific so that going stale is obvious rather than invisible.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";

interface Row {
  icon: React.ElementType;
  label: string;
  detail: string;
}

const STORED: Row[] = [
  { icon: Users, label: "Clients and contacts", detail: "Names, email addresses, phone numbers and the projects attached to each account." },
  { icon: FileText, label: "Projects and scope", detail: "Briefs, rooms, BOQ items, tiers, drawings, snags and site updates." },
  { icon: Database, label: "Commercials", detail: "Quotes, approved tiers, payment milestones, invoices, purchase orders and vendor costs." },
  { icon: ShieldCheck, label: "Documents and signatures", detail: "Terms dockets, execution agreements, handover dockets and their signature records." },
];

const PROCESSORS: Row[] = [
  { icon: Cloud, label: "Google Firebase", detail: "Authentication, Firestore database, file storage and the server functions. This is where studio data lives." },
  { icon: Sparkles, label: "Google Gemini", detail: "AI features only. Prompts are sent from the studio's server, never the browser, and carry only the text needed for the request." },
  { icon: TypeIcon, label: "Google Fonts", detail: "Typefaces are fetched from Google's CDN when a page loads. No studio data is involved." },
  { icon: MessageCircle, label: "WhatsApp", detail: "Only when someone chooses to send a message. The link opens WhatsApp with a drafted message; nothing is sent automatically." },
  { icon: ImageIcon, label: "Image CDNs", detail: "Unsplash and a CloudFront bucket serve stock and template imagery. Requests carry no studio data." },
];

const Page: React.FC = () => {
  const reduce = !!useReducedMotion();
  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduce ? 0 : 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  });

  const Section: React.FC<{ i: number; title: string; blurb: string; rows: Row[] }> = ({ i, title, blurb, rows }) => (
    <motion.section {...rise(i)} className="bg-white rounded-3xl border border-slate-200/70 p-6">
      <h2 className="text-[15px] font-bold tracking-tight" style={{ color: INK }}>{title}</h2>
      <p className="text-[12.5px] text-slate-500 mt-1">{blurb}</p>
      <ul className="mt-5 space-y-4">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label} className="flex items-start gap-3">
              <span className="w-8 h-8 shrink-0 rounded-xl bg-[#F1F4FB] flex items-center justify-center" style={{ color: BRAND }}>
                <Icon className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold" style={{ color: INK }}>{r.label}</span>
                <span className="block text-[12.5px] text-slate-500 leading-relaxed mt-0.5">{r.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );

  return (
    <div className="px-4 pb-10 max-w-[1000px]">
      <motion.p {...rise(0)} className="text-[10.5px] font-bold uppercase tracking-[0.28em]" style={{ color: BRAND }}>
        How this system handles data
      </motion.p>
      <motion.p {...rise(1)} className="mt-3 text-[14px] leading-relaxed text-slate-600 max-w-[62ch]">
        A plain account of what Studio Copilot stores, where it is kept and what
        leaves the studio. This describes how the system is built. It is not a
        legal policy and makes no commitments on the studio&rsquo;s behalf.
      </motion.p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Section i={2} title="What is stored" blurb="Held in the studio's own Firestore database, separated by tenant." rows={STORED} />
        <Section i={3} title="Who processes it" blurb="Every external service this app talks to." rows={PROCESSORS} />
      </div>

      <motion.section {...rise(4)} className="mt-5 bg-white rounded-3xl border border-slate-200/70 p-6">
        <h2 className="text-[15px] font-bold tracking-tight" style={{ color: INK }}>What this system does not do</h2>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3">
            <span className="w-8 h-8 shrink-0 rounded-xl bg-[#ECF7F2] text-[#0E7C5A] flex items-center justify-center">
              <EyeOff className="w-4 h-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold" style={{ color: INK }}>No analytics, no trackers, no advertising</span>
              <span className="block text-[12.5px] text-slate-500 leading-relaxed mt-0.5">
                There is no Google Analytics, Mixpanel, PostHog, Sentry or any
                other tracking script anywhere in this application. Nothing
                follows anyone between sessions and no behavioural data is sold,
                shared or collected.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-8 h-8 shrink-0 rounded-xl bg-[#ECF7F2] text-[#0E7C5A] flex items-center justify-center">
              <KeyRound className="w-4 h-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold" style={{ color: INK }}>AI keys never reach a browser</span>
              <span className="block text-[12.5px] text-slate-500 leading-relaxed mt-0.5">
                AI requests are made by the studio&rsquo;s own server functions,
                which hold the credentials. The browser sends a prompt and
                receives text; it is never given the key.
              </span>
            </span>
          </li>
        </ul>
      </motion.section>

      <motion.p {...rise(5)} className="mt-6 text-[11.5px] text-slate-400 leading-relaxed max-w-[70ch]">
        This page is maintained alongside the code it describes. If a new
        service is ever added, it belongs on the processor list above &mdash; a
        page like this is only worth having while it stays true.
      </motion.p>
    </div>
  );
};

export default Page;
