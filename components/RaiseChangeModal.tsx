import React, { useMemo, useState } from 'react';
import { MaterialSelection } from '../types';
import { generateId } from '../lib/utils';
import { XCircleIcon } from './Icons';

interface RaiseChangeModalProps {
  /** The selections this change can be raised against. */
  selections: MaterialSelection[];
  rooms: string[];
  /** ₹ above which the client has to sign the change off before it counts. */
  signoffThreshold: number;
  allowZeroCost: boolean;
  onClose: () => void;
  onSave: (cr: MaterialSelection) => void;
}

const inr = (n: number) => '₹' + Math.round(Math.abs(n || 0)).toLocaleString('en-IN');

/*
  Raising a cost variation by hand.

  Most variations on this screen arrive on their own — a quote comes in over
  its allowance, or a locked selection is reopened — and those already carry
  the item they belong to. This is the other case: something changed that the
  schedule has no row for yet, and it still has to reach the contract.

  The one thing the old flow never told you is the thing that decides what
  happens next: whether the amount crosses the studio's sign-off threshold.
  Below it the cost is absorbed silently; above it the client has to agree.
  That verdict is shown live, before saving, not in an alert afterwards.
*/
const RaiseChangeModal: React.FC<RaiseChangeModalProps> = ({
  selections,
  rooms,
  signoffThreshold,
  allowZeroCost,
  onClose,
  onSave,
}) => {
  const [affectedId, setAffectedId] = useState<string>('');
  const [itemName, setItemName] = useState('');
  const [roomId, setRoomId] = useState<string>(rooms[0] || 'General');
  const [costDelta, setCostDelta] = useState<number>(0);
  const [timelineDeltaDays, setTimelineDeltaDays] = useState<number>(0);
  const [reason, setReason] = useState('');

  const affected = selections.find(s => s.id === affectedId);

  // Picking an item answers the name and the room, so stop asking for them.
  const effectiveName = affected ? affected.itemName : itemName;
  const effectiveRoom = affected ? affected.roomId : roomId;

  const needsSignoff = Math.abs(costDelta) > signoffThreshold;
  const zeroBlocked = !allowZeroCost && costDelta === 0;
  const reasonShort = reason.trim().length < 20;
  const canSave = !!effectiveName.trim() && !reasonShort && !zeroBlocked;

  const verdict = useMemo(() => {
    if (zeroBlocked) {
      return {
        tone: 'bad' as const,
        text: 'Studio settings do not allow a change with no cost impact. Enter an amount, or record this as a note on the selection instead.',
      };
    }
    if (needsSignoff) {
      return {
        tone: 'warn' as const,
        text: `${inr(costDelta)} is over the ${inr(signoffThreshold)} threshold, so this goes to the client for sign-off before it touches the contract value.`,
      };
    }
    return {
      tone: 'ok' as const,
      text: `${inr(costDelta)} is within the ${inr(signoffThreshold)} threshold, so it is absorbed into the BOQ straight away — the client is not asked.`,
    };
  }, [costDelta, needsSignoff, signoffThreshold, zeroBlocked]);

  const handleSave = () => {
    if (!canSave) return;
    const cr: MaterialSelection = {
      id: 'cr_' + generateId(),
      roomId: effectiveRoom || 'General',
      itemName: effectiveName.trim(),
      category: affected?.category || 'Change',
      finishCode: affected?.finishCode || '',
      status: 'at_shop' as any,
      leadTimeDays: affected?.leadTimeDays ?? 0,
      itemType: 'change_request',
      notes: reason.trim(),
      changeReason: reason.trim(),
      changeRequestedAt: new Date().toISOString(),
      changeRequestedBy: 'designer',
      costDelta,
      timelineDeltaDays,
      affectedBoqItemId: affected?.id,
      requiresClientSignoff: needsSignoff,
      clientSignoffStatus: needsSignoff ? 'pending' : 'not_required',
      boqAbsorbed: !needsSignoff,
      needsSignoffRouting: needsSignoff,
      timelineApplied: false,
    };
    onSave(cr);
  };

  const toneClass =
    verdict.tone === 'bad'
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : verdict.tone === 'warn'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-[#EDE8F5] border-[#ADBBDA] text-[#3D52A0]';

  return (
    <div className="fixed inset-0 bg-[#3D52A0]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <header className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-900">Raise a cost variation</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Something already in the contract has moved. Record what changed and what it costs.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-slate-600">
            <XCircleIcon className="w-7 h-7" />
          </button>
        </header>

        <div className="px-6 py-5 overflow-y-auto space-y-5">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Against which selection
            </span>
            <select
              value={affectedId}
              onChange={e => setAffectedId(e.target.value)}
              className="w-full text-sm font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
            >
              <option value="">Not tied to a selection</option>
              {selections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.itemName} — {s.roomId}
                </option>
              ))}
            </select>
          </label>

          {!affected && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  What changed
                </span>
                <input
                  type="text"
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  placeholder="e.g. Extra socket points, master bedroom"
                  className="w-full text-sm font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Room</span>
                <select
                  value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                  className="w-full text-sm font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                >
                  {(rooms.length ? rooms : ['General']).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Cost impact (₹)
              </span>
              <input
                type="number"
                value={costDelta || ''}
                onChange={e => setCostDelta(parseFloat(e.target.value) || 0)}
                placeholder="Negative if it saves money"
                className="w-full text-sm font-bold rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right tabular-nums focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Days added to the programme
              </span>
              <input
                type="number"
                value={timelineDeltaDays || ''}
                onChange={e => setTimelineDeltaDays(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                className="w-full text-sm font-bold rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right tabular-nums focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              <span>Why it changed</span>
              <span className={reasonShort ? 'text-amber-600' : 'text-emerald-600'}>
                {reason.trim().length} / 20 characters
              </span>
            </span>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="The client will read this. Say what moved and why — e.g. client upgraded the veneer after seeing the sample at the shop."
              className="w-full text-sm font-medium rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none resize-none"
            />
          </label>

          <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
            <div className="text-[10px] font-black uppercase tracking-wider mb-1">
              {verdict.tone === 'bad' ? 'Cannot save' : needsSignoff ? 'Goes to the client' : 'Absorbed'}
            </div>
            <p className="text-xs font-semibold leading-snug">{verdict.text}</p>
            {timelineDeltaDays > 0 && verdict.tone !== 'bad' && (
              <p className="text-xs font-semibold leading-snug mt-1.5">
                The {timelineDeltaDays}-day shift is recorded here but is not applied to the programme until you apply it.
              </p>
            )}
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/60">
          <button
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 px-4 py-2.5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-colors"
          >
            {needsSignoff ? 'Raise and route for sign-off' : 'Raise and absorb'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default RaiseChangeModal;
