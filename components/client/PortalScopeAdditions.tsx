import React from "react";
import { PortalScopeAddition } from "../../lib/portalProjection";
import { Layers, Check, Clock, Info, ChevronDown, FileText } from "lucide-react";

/**
 * SCOPE ADDITIONS, AS THE CLIENT SEES THEM.
 *
 * A client could be sent a supplementary invoice and find nothing about it in
 * their portal -- the whole record of what they had asked for beyond the signed
 * scope, what it cost and whether it was settled lived only in the studio's own
 * screens and a PDF attached to an email.
 *
 * Three things, and only three: what each addition is for in their own words,
 * which of them are waiting on them, and the rule that the work starts once the
 * invoice clears. Cost, margin and the internal type code never reach here --
 * the projection drops them before this component ever sees a row.
 */

const money = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

interface Props {
  additions?: PortalScopeAddition[];
  /** Opens the studio's own invoice document for that addition. */
  onOpenInvoice?: (ref: string) => void;
}

const PortalScopeAdditions: React.FC<Props> = ({ additions, onOpenInvoice }) => {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  /* Absent means the studio has not published any. An empty section would
     imply a decision nobody made. */
  if (!additions || additions.length === 0) return null;

  const awaiting = additions.filter((a) => !a.released);
  const awaitingTotal = awaiting.reduce((s, a) => s + (a.grandTotal || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 shrink-0 text-[#3D52A0]" strokeWidth={2.3} />
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-slate-900">Changes you have asked for</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Work added after the original scope was agreed, invoiced separately.
            </p>
          </div>
        </div>
        {awaiting.length > 0 && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {awaiting.length} awaiting payment
          </span>
        )}
      </div>

      {/* ── what is waiting on them ─────────────────────────────────── */}
      {awaiting.length > 0 && (
        <div className="px-5 py-3 bg-amber-50/60 border-b border-amber-100">
          <p className="text-[12.5px] text-amber-900 leading-relaxed">
            <strong className="font-bold">{money(awaitingTotal)}</strong> is outstanding across{" "}
            {awaiting.length} {awaiting.length === 1 ? "addition" : "additions"}. Each is released to
            site once its invoice clears.
          </p>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {additions.map((a) => {
          const issued = a.issuedAt ? new Date(a.issuedAt) : null;
          const lines = a.lines || [];
          const open = expanded === a.ref;
          return (
            <div key={a.ref} className="px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-bold text-slate-700">{a.ref}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      {a.nature}
                    </span>
                    {issued && (
                      <span className="text-[11px] text-slate-400">
                        invoiced {issued.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13.5px] text-slate-700 leading-snug">{a.request}</p>
                </div>

                <div className="shrink-0 sm:text-right">
                  <span className="block text-[15px] font-bold text-slate-900 tabular-nums">
                    {money(a.grandTotal)}
                  </span>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold ${
                      a.released ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {a.released ? (
                      <>
                        <Check className="w-3 h-3" strokeWidth={3} /> Paid · released to site
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3" strokeWidth={2.6} /> Awaiting payment
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/*
                What the money buys, and the document it is owed against.

                PortalPayments states the rule this section has to live by: a
                client should pay against a document from their studio, not
                against a screen of numbers. So the amount is never the whole
                story here -- the lines say what the work is, and the invoice
                itself is one click away.
              */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {lines.length > 0 && (
                  <button
                    onClick={() => setExpanded(open ? null : a.ref)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11.5px] font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.4} />
                    {open ? "Hide" : `What this covers · ${lines.length} ${lines.length === 1 ? "item" : "items"}`}
                  </button>
                )}
                {onOpenInvoice && (
                  <button
                    onClick={() => onOpenInvoice(a.ref)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[#3D52A0] hover:bg-slate-50 text-[11.5px] font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" strokeWidth={2.4} />
                    Invoice {a.ref}
                  </button>
                )}
              </div>

              {open && lines.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3 w-20 text-right">Qty</th>
                        <th className="py-2 px-3 w-20">Unit</th>
                        <th className="py-2 px-3 w-28 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3 text-[12.5px] text-slate-700">{l.description}</td>
                          <td className="py-2 px-3 text-[12.5px] text-right tabular-nums text-slate-600">{l.qty}</td>
                          <td className="py-2 px-3 text-[12.5px] text-slate-500">{l.unit}</td>
                          <td className="py-2 px-3 text-[12.5px] text-right tabular-nums text-slate-700">{money(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                    Design fee {money(a.designFeeTotal)} · site work {money(a.executionTotal)} · both include GST.
                    The invoice shows the full tax breakdown.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── the rule, stated once ───────────────────────────────────── */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-[2px]" strokeWidth={2.3} />
        <p className="text-[11.5px] text-slate-500 leading-relaxed">
          An addition is scheduled and released to site once its invoice is cleared. Until then your
          original scope continues unchanged — nothing already agreed is affected or delayed by it.
        </p>
      </div>
    </div>
  );
};

export default PortalScopeAdditions;
