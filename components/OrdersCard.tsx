import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PurchaseOrder, POPayment, POStatus } from '../types';
import { db } from '../services/dbService';
import { generateId } from '../lib/utils';
import { ChevronDown, Trash2, ShieldAlert, Plus, Landmark, Truck, FileText, Check } from 'lucide-react';

interface OrdersCardProps {
  po: PurchaseOrder;
  paidTotal: number;
  projectId: string;
  onUpdate: () => void;
}

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

/*
  What a purchase order is actually doing right now.

  `status` alone cannot answer that: a PO can be issued, delivered, billed and
  half paid at the same time, and the raw enum only records the first of those.
  The stage is therefore derived from the whole record — what has arrived, what
  has been invoiced, what has been paid — so the row you scan tells you the one
  thing you would have had to open the card to find out.
*/
export type POStage =
  | 'cancelled'
  | 'not_issued'
  | 'overdue'
  | 'awaiting_delivery'
  | 'awaiting_bill'
  | 'balance_due'
  | 'settled';

export function stageOf(po: PurchaseOrder, paidTotal: number): POStage {
  if (po.status === 'cancelled') return 'cancelled';
  if (po.status === 'draft' || po.status === 'pending_approval') return 'not_issued';

  if (!po.receivedAt) {
    if (po.expectedDelivery) {
      const due = new Date(po.expectedDelivery).getTime();
      if (!isNaN(due) && due < new Date().setHours(0, 0, 0, 0)) return 'overdue';
    }
    return 'awaiting_delivery';
  }

  if (!po.billAmount) return 'awaiting_bill';
  const owed = (po.billAmount || po.total) - paidTotal;
  return owed > 0 ? 'balance_due' : 'settled';
}

export const STAGE: Record<POStage, { label: string; chip: string; dot: string }> = {
  cancelled:         { label: 'Cancelled',         chip: 'bg-slate-100 text-slate-500 border-slate-200',    dot: '#94A3B8' },
  not_issued:        { label: 'Not issued',        chip: 'bg-slate-100 text-slate-700 border-slate-300',    dot: '#8697C4' },
  overdue:           { label: 'Overdue',           chip: 'bg-rose-50 text-rose-800 border-rose-200',        dot: '#C4574F' },
  awaiting_delivery: { label: 'Awaiting delivery', chip: 'bg-amber-50 text-amber-800 border-amber-200',     dot: '#D9A441' },
  awaiting_bill:     { label: 'Awaiting bill',     chip: 'bg-[#EDE8F5] text-[#3D52A0] border-[#ADBBDA]',    dot: '#7091E6' },
  balance_due:       { label: 'Balance due',       chip: 'bg-[#EDE8F5] text-[#3D52A0] border-[#ADBBDA]',    dot: '#3D52A0' },
  settled:           { label: 'Settled',           chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: '#2F9E6E' },
};

const OrdersCard: React.FC<OrdersCardProps> = ({ po, paidTotal, projectId, onUpdate }) => {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 'idle' | 'saving' | 'saved' — the card says what it did instead of a dialog.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [status, setStatus] = useState<POStatus>(po.status);
  const [receivedAt, setReceivedAt] = useState<string>(
    po.receivedAt ? new Date(po.receivedAt).toISOString().split('T')[0] : '',
  );
  const [receivedNote, setReceivedNote] = useState<string>(po.receivedNote || '');
  const [billNumber, setBillNumber] = useState<string>(po.billNumber || '');
  const [billAmount, setBillAmount] = useState<number>(po.billAmount || 0);
  const [billDate, setBillDate] = useState<string>(po.billDate || '');

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentType, setPaymentType] = useState<'advance' | 'part' | 'final'>('advance');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<string>('bank');
  const [paymentRef, setPaymentRef] = useState<string>('');

  const stage = stageOf(po, paidTotal);
  const billed = po.billAmount || 0;
  const owed = (billed || po.total) - paidTotal;

  /*
    Autosave, not a Save button.

    Every field here is a fact being recorded after the event — the bill
    number as it comes in, the date the goods landed. Nobody is composing
    anything, so asking them to press Save and then closing an alert() over
    it was two steps of ceremony around a single keystroke. The write is
    debounced and the card reports it in place.
  */
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** A date input only carries the day, so both sides are compared at that resolution. */
  const dayStamp = (v: number | string | null | undefined) => {
    if (!v) return null;
    const iso = typeof v === 'number' ? new Date(v).toISOString().split('T')[0] : String(v);
    const t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
  };

  const patch = useMemo(
    () => ({
      status,
      receivedAt: dayStamp(receivedAt),
      receivedNote: receivedNote || null,
      billNumber: billNumber || null,
      billAmount: billAmount || null,
      billDate: billDate || null,
    }),
    [status, receivedAt, receivedNote, billNumber, billAmount, billDate],
  );

  /*
    What is already stored, in the same shape the fields produce.

    A mount flag would be the obvious guard here and it is the wrong one:
    StrictMode runs the effect twice, so the second run sees the flag already
    set and fires a write nobody asked for. Comparing against the record
    itself is true however many times the effect runs.
  */
  const baseline = useMemo(
    () => ({
      status: po.status,
      receivedAt: dayStamp(po.receivedAt),
      receivedNote: po.receivedNote || null,
      billNumber: po.billNumber || null,
      billAmount: po.billAmount || null,
      billDate: po.billDate || null,
    }),
    [po],
  );

  useEffect(() => {
    if (JSON.stringify(patch) === JSON.stringify(baseline)) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const existing = await db.getPurchaseOrders(projectId);
        await db.savePurchaseOrders(
          projectId,
          existing.map(x => (x.id === po.id ? { ...x, ...patch, updatedAt: Date.now() } : x)),
        );
        setError(null);
        setSaveState('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState('idle'), 2000);
        onUpdate();
      } catch (err: any) {
        setError(err?.message || 'Could not save that change.');
        setSaveState('idle');
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch]);

  const handleAddPayment = async () => {
    if (paymentAmount <= 0) {
      setError('Enter an amount before recording the payment.');
      return;
    }
    setSaveState('saving');
    try {
      const newPayment: POPayment = {
        id: 'pay_' + generateId(),
        type: paymentType,
        amount: paymentAmount,
        paidOn: paymentDate,
        mode: paymentMode,
        reference: paymentRef || undefined,
      };
      const existing = await db.getPurchaseOrders(projectId);
      await db.savePurchaseOrders(
        projectId,
        existing.map(x =>
          x.id === po.id
            ? { ...x, payments: [...(x.payments || []), newPayment], updatedAt: Date.now() }
            : x,
        ),
      );
      setShowAddPayment(false);
      setPaymentAmount(0);
      setPaymentRef('');
      setError(null);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      onUpdate();
    } catch (err: any) {
      setError(err?.message || 'Could not record that payment.');
      setSaveState('idle');
    }
  };

  const handleDeletePayment = async (payId: string) => {
    if (!window.confirm('Delete this payment record?')) return;
    try {
      const existing = await db.getPurchaseOrders(projectId);
      await db.savePurchaseOrders(
        projectId,
        existing.map(x =>
          x.id === po.id
            ? { ...x, payments: (x.payments || []).filter(p => p.id !== payId), updatedAt: Date.now() }
            : x,
        ),
      );
      onUpdate();
    } catch (err: any) {
      setError('Could not delete that payment.');
    }
  };

  const handleDeletePO = async () => {
    if (!window.confirm(`Delete ${po.poNumber} and everything recorded against it?`)) return;
    try {
      const existing = await db.getPurchaseOrders(projectId);
      await db.savePurchaseOrders(projectId, existing.filter(x => x.id !== po.id));
      onUpdate();
    } catch (err: any) {
      setError('Could not delete this purchase order.');
    }
  };

  const st = STAGE[stage];
  const deliveryLabel = po.receivedAt
    ? 'Delivered ' + new Date(po.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : po.expectedDelivery
      ? 'Due ' + new Date(po.expectedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : 'No date set';

  return (
    <div
      className={`bg-white border rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${
        stage === 'overdue' ? 'border-rose-200' : 'border-slate-200'
      }`}
    >
      {/*
        The row you scan.

        Four things decide whether this PO needs you today: which vendor, how
        much, where it has got to, and when it lands. They read left to right
        in that order and nothing else competes with them.
      */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full text-left px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-[#EDE8F5]/40 transition-colors"
      >
        <span className="w-1 self-stretch rounded-full hidden sm:block shrink-0" style={{ background: st.dot }} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black tracking-tight text-slate-900">{po.vendorName}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${st.chip}`}>
              {st.label}
            </span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
            {po.poNumber} · {po.scope} · {po.lines?.length || 0} {po.lines?.length === 1 ? 'line' : 'lines'}
            {po.roomId && po.roomId !== 'General' ? ' · ' + po.roomId : ''}
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <div className={`text-[11px] font-bold ${stage === 'overdue' ? 'text-rose-700' : 'text-slate-500'}`}>
              {deliveryLabel}
            </div>
            <div className="text-[11px] font-semibold text-slate-400">
              {paidTotal > 0 ? inr(paidTotal) + ' paid' : 'Nothing paid'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-black text-slate-900 tabular-nums">{inr(po.total)}</div>
            {owed > 0 && po.status !== 'cancelled' ? (
              <div className="text-[11px] font-bold text-[#3D52A0] tabular-nums">{inr(owed)} to pay</div>
            ) : billed > 0 && owed <= 0 ? (
              <div className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Fully paid</div>
            ) : null}
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-[#EDE8F5]/25 px-5 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Raised {new Date(po.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span
              className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-opacity ${
                saveState === 'idle' ? 'opacity-0' : 'opacity-100'
              } ${saveState === 'saved' ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              {saveState === 'saved' ? <><Check className="w-3 h-3" /> Saved</> : 'Saving…'}
            </span>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-800">{error}</p>
            </div>
          )}

          {/* ── 1. The order ─────────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#3D52A0]" />
              <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-900">What was ordered</h5>
            </header>

            <div className="divide-y divide-slate-50">
              {po.lines?.map(line => (
                <div key={line.id} className="px-4 py-2.5 flex items-center gap-4 text-xs">
                  <span className="font-semibold text-slate-800 flex-1 min-w-0 truncate">{line.description}</span>
                  <span className="w-24 text-right font-semibold text-slate-500 tabular-nums">
                    {line.qty} {line.unit || ''}
                  </span>
                  <span className="w-24 text-right font-semibold text-slate-500 tabular-nums">{inr(line.rate)}</span>
                  <span className="w-28 text-right font-black text-slate-900 tabular-nums">{inr(line.amount)}</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-100 flex justify-end gap-8 text-xs">
              <span className="font-semibold text-slate-500">Subtotal</span>
              <span className="w-28 text-right font-bold text-slate-700 tabular-nums">{inr(po.subtotal)}</span>
            </div>
            <div className="px-4 py-2.5 bg-[#EDE8F5]/60 flex justify-end gap-8 text-xs">
              <span className="font-black text-slate-700">Total incl. {po.taxRate}% tax</span>
              <span className="w-28 text-right font-black text-slate-900 tabular-nums">{inr(po.total)}</span>
            </div>

            <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Stage</span>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as POStatus)}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending approval</option>
                  <option value="issued">Issued to vendor</option>
                  <option value="received">Received</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Expected delivery</span>
                <div className={`text-xs font-bold py-2 ${stage === 'overdue' ? 'text-rose-700' : 'text-slate-700'}`}>
                  {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString('en-IN') : 'Not specified'}
                  {stage === 'overdue' && ' · overdue'}
                </div>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Payment terms</span>
                <div className="text-xs font-bold text-slate-700 py-2">{po.terms || 'Standard terms'}</div>
              </div>
            </div>
          </section>

          {/* ── 2. What landed ───────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 text-[#3D52A0]" />
              <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-900">What landed on site</h5>
            </header>
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Received on</span>
                <input
                  type="date"
                  value={receivedAt}
                  onChange={e => setReceivedAt(e.target.value)}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Condition on arrival</span>
                <input
                  type="text"
                  value={receivedNote}
                  onChange={e => setReceivedNote(e.target.value)}
                  placeholder="e.g. 10 boxes, 1 panel chipped — replacement promised"
                  className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                />
              </label>
            </div>
          </section>

          {/* ── 3. The money ─────────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="w-3.5 h-3.5 text-[#3D52A0]" />
                <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-900">The money</h5>
              </div>
              <div className="text-[11px] font-bold text-slate-500 tabular-nums">
                {billed > 0 ? inr(billed) + ' billed' : 'No bill yet'} · {inr(paidTotal)} paid
                {owed > 0 && <span className="text-[#3D52A0]"> · {inr(owed)} outstanding</span>}
              </div>
            </header>

            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100">
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bill number</span>
                <input
                  type="text"
                  value={billNumber}
                  onChange={e => setBillNumber(e.target.value)}
                  placeholder="e.g. INV-1022"
                  className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bill amount</span>
                <input
                  type="number"
                  value={billAmount || ''}
                  onChange={e => setBillAmount(parseFloat(e.target.value) || 0)}
                  placeholder="What the vendor actually invoiced"
                  className="w-full text-xs font-bold rounded-xl border border-slate-200 bg-white px-3 py-2 text-right tabular-nums focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bill date</span>
                <input
                  type="date"
                  value={billDate}
                  onChange={e => setBillDate(e.target.value)}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] focus:outline-none"
                />
              </label>
            </div>

            {billed > 0 && billed !== po.total && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                <p className="text-[11px] font-semibold text-amber-800">
                  The bill is {inr(Math.abs(billed - po.total))} {billed > po.total ? 'more' : 'less'} than the order.
                </p>
              </div>
            )}

            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payments</span>
                <button
                  type="button"
                  onClick={() => setShowAddPayment(!showAddPayment)}
                  className="text-[11px] font-black text-[#3D52A0] hover:text-[#334486] uppercase tracking-wider flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Record a payment
                </button>
              </div>

              {showAddPayment && (
                <div className="bg-[#EDE8F5]/60 p-3 rounded-xl border border-[#ADBBDA] grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-3">
                  <label className="md:col-span-2 block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Type</span>
                    <select
                      value={paymentType}
                      onChange={e => setPaymentType(e.target.value as any)}
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none"
                    >
                      <option value="advance">Advance</option>
                      <option value="part">Part</option>
                      <option value="final">Final</option>
                    </select>
                  </label>
                  <label className="md:col-span-3 block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Amount</span>
                    <input
                      type="number"
                      value={paymentAmount || ''}
                      onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      placeholder={owed > 0 ? inr(owed) + ' outstanding' : 'Amount'}
                      className="w-full text-xs font-bold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right tabular-nums"
                    />
                  </label>
                  <label className="md:col-span-2 block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Paid on</span>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={e => setPaymentDate(e.target.value)}
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    />
                  </label>
                  <label className="md:col-span-2 block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Mode</span>
                    <select
                      value={paymentMode}
                      onChange={e => setPaymentMode(e.target.value)}
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none"
                    >
                      <option value="bank">Bank transfer</option>
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </label>
                  <label className="md:col-span-3 block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Reference</span>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      placeholder="UTR or cheque no."
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    />
                  </label>
                  <div className="md:col-span-12 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddPayment(false)}
                      className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPayment}
                      className="bg-[#3D52A0] hover:bg-[#334486] text-white text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-lg transition-colors"
                    >
                      Record
                    </button>
                  </div>
                </div>
              )}

              {!po.payments || po.payments.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">
                  Nothing paid against this order yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                  {po.payments.map(pay => (
                    <div key={pay.id} className="px-3 py-2 flex items-center gap-3 text-xs hover:bg-slate-50/60">
                      <span className="font-semibold text-slate-700 w-24">
                        {new Date(pay.paidOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 w-16">{pay.type}</span>
                      <span className="text-[10px] font-bold uppercase text-slate-400 w-16">{pay.mode}</span>
                      <span className="text-slate-400 flex-1 min-w-0 truncate">{pay.reference || '—'}</span>
                      <span className="font-black text-slate-900 tabular-nums">{inr(pay.amount)}</span>
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(pay.id)}
                        aria-label="Delete payment"
                        className="p-1 text-slate-300 hover:text-rose-600 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleDeletePO}
              className="text-slate-400 hover:text-rose-600 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete this order
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersCard;
