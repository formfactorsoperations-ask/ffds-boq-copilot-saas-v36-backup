import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectContext, ProposalTier } from '../../types';
import { formatINR } from '../../lib/utils';
import { CheckCircle2, X } from 'lucide-react';
import {
  AcceptanceChannel,
  CHANNEL_LABEL,
  recordProposalAcceptance,
  resolveProposalAcceptance,
  revokeProposalAcceptance,
} from '../../services/proposalAcceptanceService';

/**
 * Recording that the client accepted the proposal.
 *
 * The one commercial event the system could not represent, kept deliberately
 * separate from the journey: the stage gates continue to move on their own,
 * and this is the studio's own record that the client said yes.
 *
 * The form insists on three things, because an acceptance that omits any of
 * them is not worth having on file: who said yes, how they said it, and which
 * version of the numbers they were looking at.
 */

interface Props {
  projectContext: ProjectContext;
  setProjectContext: (updater: (prev: ProjectContext) => ProjectContext) => void;
  tiers: ProposalTier[];
  recordedBy?: string;
}

const CHANNELS: AcceptanceChannel[] = ['email', 'verbal', 'portal', 'written'];

const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ProposalAcceptanceCard({ projectContext, setProjectContext, tiers, recordedBy }: Props) {
  const state = useMemo(() => resolveProposalAcceptance(projectContext), [projectContext]);

  const [open, setOpen] = useState(false);
  const [via, setVia] = useState<AcceptanceChannel>('email');
  const [acceptedBy, setAcceptedBy] = useState(projectContext.clientName || '');
  const [tierId, setTierId] = useState(projectContext.approvedTierId || tiers[0]?.id || '');
  const [reference, setReference] = useState('');
  const [at, setAt] = useState(() => new Date().toISOString().slice(0, 10));

  const tier = tiers.find(t => t.id === tierId);
  const canSave = !!acceptedBy.trim() && !!tierId;

  const save = () => {
    if (!canSave) return;
    setProjectContext(recordProposalAcceptance({
      via,
      acceptedBy: acceptedBy.trim(),
      tierId,
      tierName: tier?.name || null,
      amount: tier?.summary?.totalSell ?? null,
      reference: reference.trim() || null,
      at: new Date(`${at}T12:00:00`).getTime(),
      recordedBy: recordedBy || null,
    }));
    setOpen(false);
  };

  /* ── Already accepted ─────────────────────────────────────────────────── */
  if (state.accepted) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex items-start gap-3"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-emerald-900">
            Proposal accepted{state.acceptedBy ? ` by ${state.acceptedBy}` : ''}
          </p>
          <p className="text-[11.5px] text-emerald-800/80 font-medium mt-0.5">
            {state.via ? CHANNEL_LABEL[state.via] : 'Recorded'} · {when(state.at)}
            {state.tierName && <> · {state.tierName}</>}
            {state.amount != null && <> · {formatINR(state.amount)}</>}
          </p>
          {state.reference && (
            <p className="text-[11px] text-emerald-800/70 font-medium mt-0.5 italic">“{state.reference}”</p>
          )}

        </div>
        <button
          onClick={() => { if (window.confirm('Withdraw the recorded acceptance for this proposal?')) setProjectContext(revokeProposalAcceptance()); }}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-900 hover:bg-white cursor-pointer transition-colors shrink-0"
        >
          Withdraw
        </button>
      </motion.section>
    );
  }

  /* ── Not yet accepted ─────────────────────────────────────────────────── */
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-900">Has the client accepted this proposal?</p>
          <p className="text-[11.5px] text-slate-500 font-medium mt-0.5">
            A studio-side record, kept separately from the stage gates.
          </p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-[#0066CC] hover:bg-[#0055B3] text-white text-[11.5px] font-bold cursor-pointer transition-colors shrink-0"
          >
            Record acceptance
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4 mt-4 border-t border-slate-100 space-y-3.5">

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">How was it accepted?</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CHANNELS.map(c => (
                    <button
                      key={c}
                      onClick={() => setVia(c)}
                      aria-pressed={via === c}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors ${
                        via === c ? 'bg-sky-50 text-[#0055B3] border-sky-200'
                                  : 'text-slate-500 border-slate-200 hover:border-sky-300 hover:text-[#0055B3]'
                      }`}
                    >
                      {CHANNEL_LABEL[c].replace('Accepted ', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Who accepted</label>
                  <input
                    value={acceptedBy}
                    onChange={e => setAcceptedBy(e.target.value)}
                    placeholder="Name of the person at the client"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-[12px] font-medium outline-none focus:border-[#0066CC] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">On</label>
                  <input
                    type="date"
                    value={at}
                    onChange={e => setAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-[12px] font-medium outline-none focus:border-[#0066CC] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Which version did they accept?
                </label>
                {tiers.length === 0 ? (
                  <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    There are no priced versions on this project yet. Acceptance has to point at a figure,
                    so build the proposal first.
                  </p>
                ) : (
                  <select
                    value={tierId}
                    onChange={e => setTierId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-[12px] font-medium outline-none focus:border-[#0066CC] transition-colors"
                  >
                    {tiers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {formatINR(t.summary?.totalSell || 0)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Evidence <span className="text-slate-300 normal-case font-medium">(optional)</span>
                </label>
                <input
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder={via === 'verbal' ? 'e.g. Confirmed on call with Mr Naik, 4pm' : 'e.g. Email subject, or document reference'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-[12px] font-medium outline-none focus:border-[#0066CC] transition-colors"
                />
                {via === 'verbal' && (
                  <p className="text-[10.5px] text-slate-400 font-medium mt-1">
                    A verbal acceptance is worth recording, but note what was said — it is the only trace it leaves.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-xl text-[11.5px] font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!canSave}
                  className="px-4 py-2 rounded-xl text-[11.5px] font-bold text-white bg-[#0066CC] hover:bg-[#0055B3]
                             disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Record acceptance
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
