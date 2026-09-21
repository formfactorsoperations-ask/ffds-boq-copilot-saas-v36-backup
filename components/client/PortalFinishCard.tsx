import React from "react";
import { MaterialSelection } from "../../types";
import { Check, Clock, MessageSquare, ImageOff } from "lucide-react";

/**
 * A FINISH, WITH THE BASIS FOR SAYING YES.
 *
 * The first version of this card showed an item name, a room, and a button
 * reading "Confirm this finish" -- the exact pattern this portal had already
 * removed once and documented at ClientPortal.tsx:1626: "a click approved
 * something the client had not seen".
 *
 * WHAT THE CLIENT IS ACTUALLY DECIDING: the material, not the money.
 *
 * A finish within its allowance is already paid for under the contract. Putting
 * its cost on the card made every choice look like a fresh bill and buried the
 * thing they are really choosing -- an earlier version led with "8,250" for a
 * laminate the client had already bought.
 *
 * So money appears only when there IS a money decision: the finish costs more
 * than the allowance their contract carries for that item, which becomes a cost
 * variation against the project. Then the extra is stated plainly and the button
 * itself carries it. Otherwise the card shows the finish -- photograph, brand
 * and code, vendor, spec, lead time -- and asks them to choose it.
 *
 * Whether they can act comes from the selection's STATUS, not from whether a
 * price happens to be filled in. `to_select` means the studio is still sourcing
 * it; there is nothing to confirm yet, and saying "not priced" implied the
 * choice existed and only the number was missing.
 */

const money = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

interface Props {
  selection: MaterialSelection & { costDelta?: number; boqAbsorbed?: boolean };
  onConfirm: (id: string) => void;
  onAsk: () => void;
  readOnly?: boolean;
  /** True when the client arrived here from this finish's own link. */
  highlight?: boolean;
  /**
   * The studio looking at its own preview.
   *
   * The card renders exactly as the client will see it, and the action is
   * inert. Two earlier versions both got this wrong: the first hid the control
   * entirely, so the preview showed a finish with no way to confirm it and the
   * studio could not tell whether the client had one; the second gave the
   * studio its own "Mark confirmed for client" button, which put an action in
   * the preview that does not exist in the portal -- a preview that shows
   * something other than the thing it previews.
   *
   * Confirming on a client's behalf is a real need, and it already has a home:
   * "Approve Direct" on SOF & Selections, where the studio works with these
   * selections anyway. This says so rather than duplicating it.
   */
  onBehalf?: boolean;
}

const PortalFinishCard: React.FC<Props> = ({ selection: m, onConfirm, onAsk, readOnly, highlight, onBehalf }) => {
  const st = String(m.status || "");
  const settled = ["approved", "confirmed", "locked", "ordered"].includes(st);
  /* Sent to them and waiting: the only state with something to decide. */
  const awaitingClient = ["sent_for_approval", "pending_approval"].includes(st);
  /* Asked and waiting on the studio -- not on them. */
  const queried = st === "change_requested";
  const photo = m.photos && m.photos.length > 0 ? m.photos[0] : null;

  const qty = m.estimatedQty || 0;
  const rawTotal =
    m.estimatedTotal ?? (m.quotedPrice != null && qty ? m.quotedPrice * qty : m.quotedPrice ?? null);

  const priced = rawTotal != null && rawTotal > 0;
  const allowanceTotal =
    priced && m.allowancePrice != null ? m.allowancePrice * (qty || 1) : null;

  /*
    The only money worth showing: what this costs them ON TOP of what they have
    already paid for. Within the allowance there is nothing to decide about
    cost, so nothing about cost is shown.

    Absorbed means the studio has taken the overage on, and the client owes
    nothing -- worth saying, because otherwise they assume they do.
  */
  const absorbed = !!(m as any).boqAbsorbed;
  const over =
    priced && allowanceTotal != null ? Math.round((rawTotal as number) - allowanceTotal) : 0;
  const extra = over > 0 ? over : 0;
  const chargeable = extra > 0 && !absorbed;

  return (
    <div
      id={`finish-${m.id}`}
      className={`rounded-2xl border bg-white overflow-hidden flex flex-col transition-shadow ${
        highlight ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/20' : 'border-slate-200'
      }`}
    >
      <div className="flex gap-4 p-4">
        {/* ── the photograph ──────────────────────────────────────── */}
        <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {photo ? (
            <img src={photo} alt={m.itemName} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center px-1">
              <ImageOff className="w-4 h-4 text-slate-300 mx-auto" strokeWidth={2} />
              <span className="block text-[9px] text-slate-400 mt-1 leading-tight">No photo yet</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-slate-900 text-[14px] truncate">{m.itemName}</p>
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                {[m.roomId, m.category].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                settled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {settled ? "Confirmed" : "To confirm"}
            </span>
          </div>

          {/* What it is, precisely enough to recognise or look up. */}
          {(m.brand || m.finishCode || m.vendor) && (
            <p className="mt-1.5 text-[12.5px] text-slate-600">
              {m.brand && <span className="font-semibold">{m.brand}</span>}
              {m.brand && m.finishCode && <span className="text-slate-300 mx-1.5">|</span>}
              {m.finishCode && <span>{m.finishCode}</span>}
              {m.vendor && (
                <span className="text-slate-400">
                  {(m.brand || m.finishCode) ? ' · ' : ''}from {m.vendor}
                </span>
              )}
            </p>
          )}

          {(m.dimensions || m.colorTemp || m.wattage) && (
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              {[m.dimensions, m.colorTemp, m.wattage].filter(Boolean).join(" · ")}
            </p>
          )}

          {m.notes && <p className="mt-1.5 text-[12px] text-slate-500 leading-snug">{m.notes}</p>}
        </div>
      </div>

      {/* ── how long it takes. Always relevant; it moves their dates. ── */}
      {m.leadTimeDays > 0 && (
        <div className="px-4 pb-3">
          <span className="text-[12px] text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={2.3} /> ready in {m.leadTimeDays} days
          </span>
        </div>
      )}

      {/*
        MONEY ONLY WHEN THERE IS A MONEY DECISION.

        Within the allowance, this finish is already paid for and its price is
        not the client's problem -- showing it made every choice read as a new
        bill. Over the allowance it becomes a variation against the project, and
        then the amount is the decision, so it is stated in full: what the extra
        is, what the contract allowed, and that confirming accepts it.
      */}
      {chargeable && (
        <div className="px-4 py-2.5 border-t bg-amber-50/70 border-amber-100 text-amber-900 text-[12px] leading-snug">
          <strong className="font-bold">{money(extra)} more</strong> than the{" "}
          {money(allowanceTotal!)} your contract allows for this item. Confirming it adds that to
          your project cost.
        </div>
      )}

      {extra > 0 && absorbed && (
        <div className="px-4 py-2.5 border-t bg-emerald-50/70 border-emerald-100 text-emerald-800 text-[12px] leading-snug">
          This one costs more than the allowance, and the studio is covering the difference — there
          is nothing extra for you to pay.
        </div>
      )}

      {/* Their question, and the fact it is with the studio. A client who
          asked something should not be looking at the same "confirm" button as
          if nothing had happened. */}
      {/* Shown whenever there is one, not only while the status says so.
          Gated on change_requested, the question vanished the moment the studio
          replied -- leaving an answer with nothing to answer. */}
      {(m as any).changeReason && !settled && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {onBehalf ? 'Client asked' : 'You asked'}
            {(m as any).changeRequestedAt && (
              <span className="font-normal normal-case tracking-normal">
                {' '}· {new Date((m as any).changeRequestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-700 leading-snug">{(m as any).changeReason}</p>
          {/* Only while it is actually waiting. Left unconditional, this sat
              directly above the studio's answer telling them one was coming. */}
          {!(m as any).studioReply && (
            <p className="mt-1.5 text-[11.5px] text-slate-500">
              {onBehalf
                ? 'Waiting on the studio to reply. Answer it on SOF & Selections.'
                : 'Your studio has this and will come back to you.'}
            </p>
          )}
        </div>
      )}

      {/* The studio answered and put it back to them. Shown wherever the
          question is, so the two read as one exchange rather than an answer
          arriving with no memory of what it answered. */}
      {(m as any).studioReply && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-[#3D52A0]/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#3D52A0]">
            Studio replied
            {(m as any).studioReplyAt && (
              <span className="font-normal normal-case tracking-normal text-slate-400">
                {' '}· {new Date((m as any).studioReplyAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-700 leading-snug">{(m as any).studioReply}</p>
        </div>
      )}

      {/* ── act, or ask ──────────────────────────────────────────── */}

      {/* Still being sourced. Nothing has been put to them, so there is nothing
          to confirm -- and "not priced yet" wrongly implied the choice was made
          and only the number was outstanding. */}
      {!settled && !awaitingClient && !queried && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
          <span className="flex-1 text-[12px] text-slate-500">
            {onBehalf
              ? "Not sent to the client yet — still being sourced."
              : "Your studio is still sourcing this. Nothing needed from you yet."}
          </span>
          <button
            onClick={onAsk}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[12px] font-bold transition cursor-pointer flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={2.4} />
            Ask
          </button>
        </div>
      )}

      {!settled && awaitingClient && !readOnly && (
        <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (!onBehalf) onConfirm(m.id); }}
            disabled={onBehalf}
            title={onBehalf ? "The client confirms this from their own portal." : undefined}
            className={`flex-1 px-3 py-2 rounded-lg text-white text-[12px] font-bold transition flex items-center justify-center gap-1.5 ${
              onBehalf
                ? "bg-[#3D52A0]/40 cursor-not-allowed"
                : "bg-[#3D52A0] hover:bg-[#334486] cursor-pointer"
            }`}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
            {chargeable ? `Confirm and accept ${money(extra)} extra` : "Confirm this finish"}
          </button>
          <button
            onClick={onAsk}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[12px] font-bold transition cursor-pointer flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={2.4} />
            Ask
          </button>
        </div>
        {onBehalf && (
          <p className="mt-2 text-[11px] text-slate-400 leading-snug">
            This is the client's action. To confirm for them, use Approve Direct on SOF &amp; Selections.
          </p>
        )}
        </div>
      )}

      {settled && m.clientConfirmedAt && (
        <div className="px-4 py-2.5 border-t border-slate-100 text-[11.5px] text-emerald-700 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
          You confirmed this on{" "}
          {new Date(m.clientConfirmedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      )}
    </div>
  );
};

export default PortalFinishCard;
