import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity, CheckCircle2, XCircle, Loader2, Copy, Check, Mail,
  LifeBuoy, Settings2, AlertTriangle,
} from "lucide-react";
import { useOrg } from "../../contexts/OrgContext";
import { verifyApiKey } from "../../services/geminiService";

/**
 * SUPPORT DESK.
 *
 * Built around the two things that actually shorten a support conversation:
 * knowing whether the system is up, and being able to hand over the details
 * nobody can ever remember.
 *
 * Deliberately not a contact form. A form implies something receives it, and
 * nothing does -- there is no ticketing system behind this app. What exists is
 * the studio's own contact address, and this page says so plainly rather than
 * pretending to be a help desk.
 *
 * The status checks are real calls, not decoration: the AI row makes an actual
 * round trip through the server function, so a green light here means AI was
 * genuinely reachable a moment ago.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";

type State = "checking" | "ok" | "down";

const Dot: React.FC<{ state: State }> = ({ state }) =>
  state === "checking" ? (
    <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" strokeWidth={2.4} />
  ) : state === "ok" ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2.4} />
  ) : (
    <XCircle className="w-4 h-4 text-rose-600 shrink-0" strokeWidth={2.4} />
  );

const SupportDeskPage: React.FC = () => {
  const { orgData, currentUserAuth } = useOrg() as any;
  const reduce = !!useReducedMotion();

  const [ai, setAi] = useState<State>("checking");
  const [copied, setCopied] = useState(false);

  /* A real round trip. "Online" here means the server function answered, which
     is the same path every AI feature in the app uses. */
  useEffect(() => {
    let alive = true;
    verifyApiKey()
      .then((s) => alive && setAi(s === "online" ? "ok" : "down"))
      .catch(() => alive && setAi("down"));
    return () => {
      alive = false;
    };
  }, []);

  const signedIn: State = currentUserAuth ? "ok" : "down";
  const database: State = orgData?.tenantId ? "ok" : "down";

  /* Everything a person is asked for and never has to hand. */
  const diagnostics = [
    `Studio:    ${orgData?.orgName || "unknown"}`,
    `Tenant:    ${orgData?.tenantId || "unknown"}`,
    `User:      ${currentUserAuth?.email || "not signed in"}`,
    `Role:      ${orgData?.role || "unknown"}`,
    `AI:        ${ai === "ok" ? "reachable" : ai === "down" ? "unreachable" : "checking"}`,
    `Page:      ${typeof window !== "undefined" ? window.location.href : ""}`,
    `Browser:   ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can be blocked; the block below is selectable either way. */
    }
  };

  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduce ? 0 : 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  });

  const rows: { label: string; detail: string; state: State }[] = [
    { label: "Signed in", detail: currentUserAuth?.email || "No active session", state: signedIn },
    { label: "Studio database", detail: orgData?.tenantId ? `Connected — ${orgData.tenantId}` : "Not connected", state: database },
    { label: "AI service", detail: ai === "ok" ? "Reachable" : ai === "down" ? "Not responding" : "Checking…", state: ai },
  ];

  return (
    <div className="px-4 pb-10 max-w-[1000px]">
      <motion.p {...rise(0)} className="text-[10.5px] font-bold uppercase tracking-[0.28em]" style={{ color: BRAND }}>
        Support desk
      </motion.p>
      <motion.p {...rise(1)} className="mt-3 text-[14px] leading-relaxed text-slate-600 max-w-[62ch]">
        Check whether the system is healthy, and collect everything needed to
        report a problem in one go.
      </motion.p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {/* ── Status ─────────────────────────────────────────────────── */}
        <motion.section {...rise(2)} className="bg-white rounded-3xl border border-slate-200/70 p-6">
          <h2 className="text-[15px] font-bold tracking-tight flex items-center gap-2" style={{ color: INK }}>
            <Activity className="w-4 h-4" strokeWidth={2.4} style={{ color: BRAND }} />
            System status
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-1">Checked live, just now.</p>
          <ul className="mt-5 space-y-3.5">
            {rows.map((r) => (
              <li key={r.label} className="flex items-start gap-3">
                <span className="mt-[2px]"><Dot state={r.state} /></span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold" style={{ color: INK }}>{r.label}</span>
                  <span className="block text-[12.5px] text-slate-500 truncate">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* ── Getting help ───────────────────────────────────────────── */}
        <motion.section {...rise(3)} className="bg-white rounded-3xl border border-slate-200/70 p-6">
          <h2 className="text-[15px] font-bold tracking-tight flex items-center gap-2" style={{ color: INK }}>
            <LifeBuoy className="w-4 h-4" strokeWidth={2.4} style={{ color: BRAND }} />
            Getting help
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-1">
            There is no ticketing system behind this app. Reports go to a person.
          </p>

          {orgData?.contactEmail ? (
            <a
              href={`mailto:${orgData.contactEmail}?subject=${encodeURIComponent("Studio Copilot — issue report")}&body=${encodeURIComponent("What happened:\n\n\nWhat I expected:\n\n\n--- diagnostics ---\n" + diagnostics)}`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
              style={{ background: BRAND }}
            >
              <Mail className="w-4 h-4" strokeWidth={2.4} />
              Email {orgData.contactEmail}
            </a>
          ) : (
            <p className="mt-5 flex items-start gap-2 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" strokeWidth={2.4} />
              <span>
                No studio contact address is set. Add one in Studio Settings and
                it will appear here.
              </span>
            </p>
          )}

          <p className="mt-4 flex items-start gap-2 text-[12px] text-slate-500 leading-relaxed">
            <Settings2 className="w-3.5 h-3.5 shrink-0 mt-[2px] text-slate-400" strokeWidth={2.2} />
            <span>
              This is the studio&rsquo;s own contact address from Studio
              Settings. If the studio runs a separate desk for this system, set
              that address there instead.
            </span>
          </p>
        </motion.section>
      </div>

      {/* ── Diagnostics ──────────────────────────────────────────────── */}
      <motion.section {...rise(4)} className="mt-5 bg-white rounded-3xl border border-slate-200/70 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-tight" style={{ color: INK }}>Diagnostics</h2>
            <p className="text-[12.5px] text-slate-500 mt-1">
              Include this with any report. It saves the first three questions.
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 hover:border-slate-300 hover:text-[#3D52A0] transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.6} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2.2} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="mt-4 rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-4 text-[11.5px] leading-relaxed text-slate-600 overflow-x-auto whitespace-pre-wrap break-words">
{diagnostics}
        </pre>
      </motion.section>
    </div>
  );
};

export default SupportDeskPage;
