import React from "react";
import { formatCurrency } from "../../lib/utils";
import { ScopeAdditionSummary } from "../../lib/scopeAdditions";
import { Layers, ArrowRight, AlertTriangle, Info } from "lucide-react";

/**
 * SCOPE ADDITIONS, IN THE MONEY TAB.
 *
 * Money stopped at the frozen BOQ. A project could carry supplementary invoices
 * the client had been sent and show none of them, so the contract value on this
 * screen was the value on the day the BOQ was frozen and nothing since.
 *
 * The ladder here is the whole point: frozen BOQ, plus what the client has
 * actually settled, equals the revised contract. What has merely been RAISED
 * sits outside that sum, stated in full but never added in -- an invoice the
 * client has not paid is a claim, not contract value, and folding it in is how
 * a studio ends up unwinding a number it has already spent.
 *
 * Every figure is ex-GST where the base contract is ex-GST, so the ladder adds
 * up rather than mixing tax-inclusive additions into a tax-exclusive contract.
 */

const INK = "#12182F";
const LABEL = "#5A628A";
const MUTED = "#8E96B8";
const BRAND = "#3D52A0";
const GOOD = "#0F766E";
const WARN = "#B45309";

interface Props {
  summary: ScopeAdditionSummary;
  /** The frozen BOQ, ex-GST, exactly as the rest of this tab states it. */
  contractedExGst: number;
  baseMarginPct: number | null;
  loading: boolean;
  error: boolean;
  /** Opens the Scope Additions screen. */
  onOpen?: () => void;
}

const Row: React.FC<{ label: string; value: string; tone?: string; bold?: boolean; note?: string }> = ({
  label, value, tone = INK, bold, note,
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <div className="min-w-0">
      <span className={`text-[12.5px] ${bold ? "font-bold" : ""}`} style={{ color: bold ? INK : LABEL }}>
        {label}
      </span>
      {note && <span className="block text-[11px] mt-0.5" style={{ color: MUTED }}>{note}</span>}
    </div>
    <span
      className={`shrink-0 tabular-nums ${bold ? "text-[17px] font-black" : "text-[13.5px] font-bold"}`}
      style={{ color: tone }}
    >
      {value}
    </span>
  </div>
);

const ScopeAdditionsMoneyPanel: React.FC<Props> = ({
  summary, contractedExGst, baseMarginPct, loading, error, onOpen,
}) => {
  const s = summary;
  const revised = contractedExGst + s.authorisedTotal;

  if (error) {
    return (
      <div className="bg-white border border-[#E2E5F0] rounded-2xl p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: LABEL }}>
          Scope additions
        </h3>
        <p className="mt-2 text-[12px]" style={{ color: MUTED }}>
          Could not read this project's scope additions, so the contract below is the frozen BOQ only.
          It is not a statement that none exist.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E5F0] rounded-2xl p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: LABEL }}>
          Scope additions
        </h3>
        <p className="mt-2 text-[12px]" style={{ color: MUTED }}>Reading supplementary invoices…</p>
      </div>
    );
  }

  const none = s.live.length === 0;

  return (
    <div className="bg-white border border-[#E2E5F0] rounded-2xl p-5 pl-6 relative overflow-hidden">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: s.raised.length > 0 ? WARN : none ? "#E2E5F0" : GOOD }}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} style={{ color: BRAND }} />
          <h3 className="text-[11px] font-bold uppercase tracking-wider shrink-0" style={{ color: LABEL }}>
            Scope additions
          </h3>
          <span
            className="inline-flex items-center text-[10px] font-semibold rounded-full border px-1.5 py-0.5"
            style={
              s.raised.length > 0
                ? { color: WARN, background: "#FEF6EC", borderColor: "#F5D9AE" }
                : none
                  ? { color: MUTED, background: "#F5F6FA", borderColor: "#E2E5F0" }
                  : { color: GOOD, background: "#ECF7F4", borderColor: "#BFE3D9" }
            }
          >
            {none
              ? "None raised"
              : s.raised.length > 0
                ? `${s.raised.length} awaiting client`
                : `${s.authorised.length} authorised`}
          </span>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: BRAND }}
          >
            Open scope additions <ArrowRight className="w-3 h-3" strokeWidth={2.6} />
          </button>
        )}
      </div>

      {none ? (
        <p className="mt-3 text-[12px]" style={{ color: MUTED }}>
          Nothing has been added since the BOQ was frozen. The contract is {formatCurrency(contractedExGst)}.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-x-8">
          {/* ── the ladder ────────────────────────────────────────────── */}
          <div className="divide-y divide-[#EDEFF7]">
            <Row label="Frozen BOQ" value={formatCurrency(contractedExGst)} />
            <Row
              label="Authorised additions"
              value={s.authorisedTotal > 0 ? `+ ${formatCurrency(s.authorisedTotal)}` : "—"}
              tone={s.authorisedTotal > 0 ? GOOD : MUTED}
              note={
                s.authorised.length > 0
                  ? `${s.authorised.length} settled and released for work`
                  : "nothing settled yet"
              }
            />
            <Row label="Revised contract" value={formatCurrency(revised)} bold />
          </div>

          {/* ── what is outstanding, kept outside the sum ──────────────── */}
          <div className="divide-y divide-[#EDEFF7] mt-4 lg:mt-0">
            <Row
              label="Raised, awaiting client"
              value={formatCurrency(s.raisedTotal)}
              tone={s.raisedTotal > 0 ? WARN : MUTED}
              note={
                s.raisedTotal > 0
                  ? `${s.raised.length} supplementary ${s.raised.length === 1 ? "invoice" : "invoices"} sent — not counted above`
                  : undefined
              }
            />
            <Row
              label="Received on additions"
              value={formatCurrency(s.collected)}
              tone={s.collected > 0 ? GOOD : MUTED}
              note={s.outstanding > 0 ? `${formatCurrency(s.outstanding)} still owed` : undefined}
            />
          </div>
        </div>
      )}

      {/* ── scope creep ─────────────────────────────────────────────── */}
      {!none && contractedExGst > 0 && (
        <div className="mt-4 pt-4 border-t border-[#EDEFF7]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: LABEL }}>
              Scope creep
            </span>
            <span className="text-[12.5px] font-bold tabular-nums" style={{ color: s.creepPct >= 15 ? WARN : INK }}>
              {s.creepPct.toFixed(1)}% of the signed contract
            </span>
          </div>

          {/* Two segments on one track: what the client has settled, and what
              has only been asked for. The scale is the contract itself, so the
              bar answers "how far has this job drifted from what we signed". */}
          <div className="mt-2 h-2 rounded-full bg-[#EDEFF7] overflow-hidden flex">
            <div
              className="h-full"
              style={{ width: `${Math.min(100, s.authorisedCreepPct)}%`, background: GOOD }}
              title={`Authorised: ${s.authorisedCreepPct.toFixed(1)}%`}
            />
            <div
              className="h-full"
              style={{ width: `${Math.min(100, Math.max(0, s.creepPct - s.authorisedCreepPct))}%`, background: WARN }}
              title={`Raised, awaiting client: ${(s.creepPct - s.authorisedCreepPct).toFixed(1)}%`}
            />
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: MUTED }}>
            {s.authorisedCreepPct > 0 && <>{s.authorisedCreepPct.toFixed(1)}% authorised · </>}
            {(s.creepPct - s.authorisedCreepPct).toFixed(1)}% raised but unsettled
          </p>
        </div>
      )}

      {/* ── margin on the additions ─────────────────────────────────── */}
      {!none && s.blendedMarginPct != null && (
        <div className="mt-4 pt-4 border-t border-[#EDEFF7] flex items-start gap-2">
          {s.thinCount > 0
            ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[1px]" strokeWidth={2.4} style={{ color: WARN }} />
            : <Info className="w-3.5 h-3.5 shrink-0 mt-[1px]" strokeWidth={2.4} style={{ color: MUTED }} />}
          <p className="text-[11.5px] leading-[1.55]" style={{ color: LABEL }}>
            Additions carry{" "}
            <strong className="font-bold tabular-nums" style={{ color: s.thinCount > 0 ? WARN : INK }}>
              {s.blendedMarginPct.toFixed(1)}% margin
            </strong>
            {baseMarginPct != null && (
              <> against {baseMarginPct.toFixed(1)}% on the contract itself</>
            )}
            {s.thinCount > 0 && (
              <>
                {" "}— {s.thinCount} of {s.margins.length}{" "}
                {s.thinCount === 1 ? "is" : "are"} priced thinner than the job {s.thinCount === 1 ? "it is" : "they are"} being added to.
              </>
            )}
            {s.thinCount === 0 && <>. Nothing is priced below the base.</>}
          </p>
        </div>
      )}

      {/* ── rate drift ──────────────────────────────────────────────── */}
      {!none && (
        <div className="mt-3 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-[1px]" strokeWidth={2.4} style={{ color: MUTED }} />
          <p className="text-[11.5px] leading-[1.55]" style={{ color: MUTED }}>
            {s.driftComparable === 0 ? (
              <>
                Rate drift could not be checked: none of the {s.driftTotalLines}{" "}
                {s.driftTotalLines === 1 ? "line" : "lines"} on these additions is linked to a rate-bank
                item, so there is nothing to compare today's rates against.
              </>
            ) : s.drift.length === 0 ? (
              <>
                {s.driftComparable} of {s.driftTotalLines} lines checked against the rate bank — no rate has
                moved since they were priced.
              </>
            ) : (
              <>
                {s.drift.length} of {s.driftComparable} checked lines are priced off stale rates —{" "}
                <strong className="font-bold tabular-nums" style={{ color: WARN }}>
                  {formatCurrency(s.driftExposure)}
                </strong>{" "}
                of exposure, worst on {s.drift[0].description}.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default ScopeAdditionsMoneyPanel;
