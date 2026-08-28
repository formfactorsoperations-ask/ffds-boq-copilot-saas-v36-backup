import React, { useState } from 'react';
import { PurchaseOrder, POPayment, POStatus } from '../types';
import { db } from '../services/dbService';
import { generateId } from '../lib/utils';
import { ChevronDown, ChevronUp, Check, RefreshCw, Trash2, ShieldAlert, Plus, DollarSign, Calendar, Landmark } from 'lucide-react';
import { UI_STYLES, UI_CONSTANTS } from '../lib/UIConstants';

interface OrdersCardProps {
  po: PurchaseOrder;
  paidTotal: number;
  projectId: string;
  onUpdate: () => void;
}

const OrdersCard: React.FC<OrdersCardProps> = ({ po, paidTotal, projectId, onUpdate }) => {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status state
  const [status, setStatus] = useState<POStatus>(po.status);

  // Receipt states
  const [receivedAt, setReceivedAt] = useState<string>(
    po.receivedAt ? new Date(po.receivedAt).toISOString().split('T')[0] : ''
  );
  const [receivedNote, setReceivedNote] = useState<string>(po.receivedNote || '');

  // Bill states
  const [billNumber, setBillNumber] = useState<string>(po.billNumber || '');
  const [billAmount, setBillAmount] = useState<number>(po.billAmount || 0);
  const [billDate, setBillDate] = useState<string>(po.billDate || '');

  // Payment states
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentType, setPaymentType] = useState<'advance' | 'part' | 'final'>('advance');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<string>('bank');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');

  const balanceDue = po.total - paidTotal;

  // Save general status and bill/receipt updates
  const handleSavePOUpdates = async () => {
    setSaving(true);
    setError(null);
    try {
      const existingPOs = await db.getPurchaseOrders(projectId);
      const updatedPOs = existingPOs.map(x => {
        if (x.id === po.id) {
          return {
            ...x,
            status,
            receivedAt: receivedAt ? new Date(receivedAt).getTime() : null,
            receivedNote: receivedNote || null,
            billNumber: billNumber || null,
            billAmount: billAmount || null,
            billDate: billDate || null,
            updatedAt: Date.now()
          };
        }
        return x;
      });
      await db.savePurchaseOrders(projectId, updatedPOs);
      onUpdate();
      alert('PO Details updated successfully!');
    } catch (err: any) {
      setError(err?.message || 'Failed to update PO details.');
    } finally {
      setSaving(false);
    }
  };

  // Add a POPayment
  const handleAddPayment = async () => {
    if (paymentAmount <= 0) {
      alert('Payment amount must be greater than zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newPayment: POPayment = {
        id: 'pay_' + generateId(),
        type: paymentType,
        amount: paymentAmount,
        paidOn: paymentDate,
        mode: paymentMode,
        reference: paymentRef || undefined,
        note: paymentNote || undefined
      };

      const existingPOs = await db.getPurchaseOrders(projectId);
      const updatedPOs = existingPOs.map(x => {
        if (x.id === po.id) {
          return {
            ...x,
            payments: [...(x.payments || []), newPayment],
            updatedAt: Date.now()
          };
        }
        return x;
      });

      await db.savePurchaseOrders(projectId, updatedPOs);
      onUpdate();

      // Clear form
      setShowAddPayment(false);
      setPaymentAmount(0);
      setPaymentRef('');
      setPaymentNote('');
      alert('Payment recorded successfully!');
    } catch (err: any) {
      setError(err?.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  // Delete POPayment
  const handleDeletePayment = async (payId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment record?')) return;
    setSaving(true);
    try {
      const existingPOs = await db.getPurchaseOrders(projectId);
      const updatedPOs = existingPOs.map(x => {
        if (x.id === po.id) {
          return {
            ...x,
            payments: (x.payments || []).filter(p => p.id !== payId),
            updatedAt: Date.now()
          };
        }
        return x;
      });
      await db.savePurchaseOrders(projectId, updatedPOs);
      onUpdate();
    } catch (err: any) {
      alert('Failed to delete payment.');
    } finally {
      setSaving(false);
    }
  };

  // Delete Purchase Order
  const handleDeletePO = async () => {
    if (!window.confirm(`Are you sure you want to completely delete PO ${po.poNumber}?`)) return;
    setSaving(true);
    try {
      const existingPOs = await db.getPurchaseOrders(projectId);
      const updatedPOs = existingPOs.filter(x => x.id !== po.id);
      await db.savePurchaseOrders(projectId, updatedPOs);
      onUpdate();
    } catch (err: any) {
      alert('Failed to delete Purchase Order.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadgeColor = (st: string) => {
    switch (st) {
      case 'draft': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'pending_approval': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'issued': return 'bg-sky-50 text-[#0055B3] border-sky-200';
      case 'received': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'closed': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'cancelled': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-[#FDFDFB] border border-slate-200/80 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      
      {/* Summary Header Row */}
      <div 
        className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h4 className="text-sm font-black tracking-tight text-slate-900">{po.poNumber}</h4>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusBadgeColor(po.status)}`}>
              {po.status.replace('_', ' ')}
            </span>
            <span className="text-xs font-semibold text-slate-400">· {po.scope}</span>
          </div>
          <div className="text-xs font-bold text-slate-500">
            {po.vendorName} · {po.lines?.length || 0} line items
          </div>
        </div>

        <div className="flex items-center gap-4 self-stretch sm:self-center justify-between sm:justify-end">
          <div className="text-right">
            <div className="text-sm font-black text-slate-900">₹{po.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            {po.status === 'issued' && balanceDue > 0 ? (
              <div className="text-[10px] font-bold text-amber-600">₹{balanceDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} pending</div>
            ) : balanceDue <= 0 && po.total > 0 ? (
              <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fully Paid</div>
            ) : null}
          </div>

          <div className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* Expanded Details Section */}
      {expanded && (
        <div className="border-t border-slate-100 px-6 py-5 bg-slate-50/40 space-y-6">
          
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-800">{error}</p>
            </div>
          )}

          {/* Quick Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Status</span>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as POStatus)}
                className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="issued">Issued (Committed)</option>
                <option value="received">Goods/Services Received</option>
                <option value="closed">Closed / Settled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Expected Delivery</span>
              <div className="text-xs font-bold text-slate-700 py-2">
                {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : 'Not specified'}
              </div>
            </div>

            <div className="md:col-span-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Payment terms</span>
              <div className="text-xs font-bold text-slate-700 py-2">
                {po.terms || 'Standard terms'}
              </div>
            </div>
          </div>

          {/* Line items list */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Item details</span>
              <div className="flex gap-12">
                <span className="w-20 text-right">Qty/Unit</span>
                <span className="w-20 text-right">Rate</span>
                <span className="w-24 text-right">Amount</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {po.lines?.map(line => (
                <div key={line.id} className="px-4 py-3 flex justify-between text-xs font-bold items-center">
                  <span className="text-slate-900 truncate max-w-sm">{line.description}</span>
                  <div className="flex gap-12 font-mono text-slate-600">
                    <span className="w-20 text-right">{line.qty} {line.unit}</span>
                    <span className="w-20 text-right">₹{line.rate.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    <span className="w-24 text-right text-slate-900 font-bold">₹{line.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-sky-50/20 px-4 py-3 flex justify-between text-xs font-black border-t border-slate-100 text-slate-900">
              <span>Subtotal</span>
              <span className="font-mono">₹{po.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="bg-sky-50/40 px-4 py-3 flex justify-between text-xs font-black text-slate-900">
              <span>Total with Tax ({po.taxRate}%)</span>
              <span className="text-sm font-mono text-slate-900 font-black">₹{po.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          {/* Delivery receipt & Actual Bill tracking */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
            {/* Receipts Tracker */}
            <div className="space-y-3">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />
                Receipts & Deliveries
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Received On</label>
                  <input
                    type="date"
                    value={receivedAt}
                    onChange={e => setReceivedAt(e.target.value)}
                    className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Receipt Note</label>
                  <input
                    type="text"
                    value={receivedNote}
                    onChange={e => setReceivedNote(e.target.value)}
                    placeholder="e.g. Received 10 boxes intact"
                    className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-3 py-2 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Bill Tracker */}
            <div className="space-y-3">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                Actual Vendor Invoice / Bill
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bill Number</label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={e => setBillNumber(e.target.value)}
                    placeholder="e.g. INV-1022"
                    className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-2.5 py-2 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bill Amount (₹)</label>
                  <input
                    type="number"
                    value={billAmount || ''}
                    onChange={e => setBillAmount(parseFloat(e.target.value) || 0)}
                    placeholder="₹ actual"
                    className="w-full text-xs font-bold rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-right focus:ring-2 focus:ring-[#0066CC] focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={e => setBillDate(e.target.value)}
                    className="w-full text-xs font-semibold rounded-xl border border-slate-200 bg-white px-2.5 py-2 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick save button for metadata change */}
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              onClick={handleSavePOUpdates}
              disabled={saving}
              className="bg-[#0066CC]/90 hover:bg-[#0055B3] disabled:bg-sky-800 text-white backdrop-blur-md border border-white/20 text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md shadow-sky-600/20"
            >
              Update Status & Invoice details
            </button>
          </div>

          {/* Payments List and recorder */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-[#0066CC]" />
                Payments Log
              </h5>
              <button
                onClick={() => setShowAddPayment(!showAddPayment)}
                className="text-xs font-black text-[#0066CC] hover:text-[#0055B3] uppercase tracking-wider flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Record Payment
              </button>
            </div>

            {/* Inline payment form */}
            {showAddPayment && (
              <div className="bg-slate-100/50 p-4 rounded-2xl border border-slate-200/50 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Type</label>
                  <select
                    value={paymentType}
                    onChange={e => setPaymentType(e.target.value as any)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="advance">Advance</option>
                    <option value="part">Part</option>
                    <option value="final">Final</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Amount Paid (₹)</label>
                  <input
                    type="number"
                    value={paymentAmount || ''}
                    onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount"
                    className="w-full text-xs font-bold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Paid On</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Mode</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI / GPay</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Reference / Note</label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                    placeholder="Ref # or transaction details"
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                  />
                </div>
                <div className="md:col-span-12 flex justify-end gap-2.5 pt-1">
                  <button
                    onClick={() => setShowAddPayment(false)}
                    className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddPayment}
                    className="bg-[#0066CC] hover:bg-[#0055B3] text-white text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-lg transition-colors"
                  >
                    Record
                  </button>
                </div>
              </div>
            )}

            {/* Payments List Table */}
            {!po.payments || po.payments.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-2">No payments logged yet for this Purchase Order.</div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2">Paid On</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {po.payments.map(pay => (
                      <tr key={pay.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">{new Date(pay.paidOn).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 uppercase text-[10px] font-black tracking-wide text-slate-800">{pay.type}</td>
                        <td className="px-4 py-2.5 uppercase text-[10px] font-bold">{pay.mode}</td>
                        <td className="px-4 py-2.5 text-slate-500 truncate max-w-[150px]">{pay.reference || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">₹{pay.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleDeletePayment(pay.id)}
                            className="p-1 text-slate-300 hover:text-rose-600 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Delete PO Block */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Raised on {new Date(po.createdAt).toLocaleDateString()}</span>
            <button
              onClick={handleDeletePO}
              className="text-rose-500 hover:text-rose-700 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete PO
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

export default OrdersCard;
