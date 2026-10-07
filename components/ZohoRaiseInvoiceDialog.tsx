import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, AlertTriangle, ExternalLink, X } from '../lib/lucide-shim';
import { useOrg } from '../contexts/OrgContext';
import { ClientBilling, PaymentMilestone } from '../types';
import { formatINR } from '../lib/utils';
import { GST_STATES, gstSplit, isValidGstin, normaliseGstin, resolveState, stateFromGstin } from '../lib/zohoBooks';
import {
  ZohoCallError,
  ZohoContactDetail,
  ZohoContactHit,
  ZohoRaiseResult,
  zohoCall,
} from '../services/zohoBooksService';

/**
 * RAISE AN INVOICE IN ZOHO BOOKS.
 *
 * Shown instead of the instant local "Raise Invoice" when the studio has the
 * Zoho Books add-in connected. It does three things the local flow never had to:
 *
 *   1. links the project's client to a Zoho customer (found, or created),
 *      once, and remembers it on the project;
 *   2. settles the place of supply, which decides CGST + SGST versus IGST;
 *   3. creates a DRAFT in Zoho and takes Zoho's invoice number back.
 *
 * The milestone is marked invoiced the moment Zoho has the draft, so the app
 * and the books cannot disagree about whether it exists. The draft is not sent:
 * the studio reviews it and sends it from Zoho Books.
 */

export interface RaiseAmounts {
  /** Ex-GST value being invoiced. */
  taxable: number;
  gst: number;
  gstRatePct: number;
  retainer: number;
  discount: number;
  discountReason?: string;
  /** What the studio's schedule says the client owes on this invoice. */
  invoiceTotal: number;
}

interface Props {
  milestone: PaymentMilestone;
  amounts: RaiseAmounts;
  projectId: string;
  projectName: string;
  client: { name?: string; email?: string; phone?: string };
  billing?: ClientBilling;
  onRaised: (result: ZohoRaiseResult, billing: ClientBilling) => void;
  onClose: () => void;
}

const field = 'w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#3D52A0] outline-none';
const cap = 'block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1';

const ZohoRaiseInvoiceDialog: React.FC<Props> = ({ milestone, amounts, projectId, projectName, client, billing, onRaised, onClose }) => {
  const { orgData } = useOrg();
  const tenantId = orgData?.tenantId;

  const [contact, setContact] = useState<{ id: string; name: string } | null>(
    billing?.zohoContactId ? { id: billing.zohoContactId, name: billing.zohoContactName || client.name || 'Zoho customer' } : null,
  );
  const [gstin, setGstin] = useState(billing?.gstin || '');
  const [place, setPlace] = useState(billing?.placeOfSupply || '');
  const [query, setQuery] = useState(client.name || '');
  const [hits, setHits] = useState<ZohoContactHit[] | null>(null);
  const [busy, setBusy] = useState<'search' | 'create' | 'raise' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ZohoRaiseResult | null>(null);

  const fail = (e: unknown) => {
    const err = e as ZohoCallError;
    setError(err?.message || 'Something went wrong.');
    setReason(err?.reason || '');
  };

  const search = async (q = query) => {
    if (!q.trim()) return;
    setBusy('search');
    setError(null);
    try {
      setHits((await zohoCall<{ contacts: ZohoContactHit[] }>('searchContacts', { query: q.trim() }, tenantId)).contacts);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  // Look for the client straight away when none is linked yet.
  useEffect(() => { if (!contact && client.name) void search(client.name); /* eslint-disable-next-line */ }, []);

  const choose = async (hit: ZohoContactHit) => {
    setBusy('search');
    setError(null);
    try {
      const { contact: c } = await zohoCall<{ contact: ZohoContactDetail }>('getContact', { contactId: hit.id }, tenantId);
      setContact({ id: hit.id, name: c.name || hit.name });
      if (c.gstin) setGstin(c.gstin);
      const st = resolveState(c.placeOfSupply) || stateFromGstin(c.gstin);
      if (st) setPlace(st.zoho);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const createContact = async () => {
    const g = normaliseGstin(gstin);
    setBusy('create');
    setError(null);
    try {
      const { contact: c } = await zohoCall<{ contact: { id: string; name: string } }>('createContact', {
        name: client.name || query, email: client.email, phone: client.phone,
        gstin: isValidGstin(g) ? g : undefined, placeOfSupply: place || undefined,
      }, tenantId);
      setContact(c);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const studioState = stateFromGstin(orgData?.gstin);
  const gstinNorm = normaliseGstin(gstin);
  const clientState = resolveState(place) || (isValidGstin(gstinNorm) ? stateFromGstin(gstinNorm) : null);
  const split = useMemo(() => gstSplit(studioState, clientState, amounts.gstRatePct), [studioState, clientState, amounts.gstRatePct]);
  const gstinProblem = gstinNorm !== '' && !isValidGstin(gstinNorm);

  const raise = async () => {
    if (!contact || !clientState) return;
    setBusy('raise');
    setError(null);
    setReason('');
    try {
      const res = await zohoCall<ZohoRaiseResult>('pushInvoice', {
        projectId, milestoneId: milestone.id, projectName, milestoneName: milestone.name, milestoneType: milestone.type,
        taxableAmount: amounts.taxable, gstAmount: amounts.gst, gstRatePct: amounts.gstRatePct,
        retainerDeducted: amounts.retainer, discountApplied: amounts.discount, discountReason: amounts.discountReason,
        contactId: contact.id, gstin: isValidGstin(gstinNorm) ? gstinNorm : undefined, placeOfSupply: clientState.zoho,
      }, tenantId);
      setResult(res);
      onRaised(res, {
        zohoContactId: contact.id, zohoContactName: contact.name,
        gstin: isValidGstin(gstinNorm) ? gstinNorm : undefined, placeOfSupply: clientState.zoho,
      });
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const mismatch = result && Math.abs(result.total - result.expectedTotal) > 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Raise invoice in Zoho Books</h3>
            <p className="text-xs text-slate-500 mt-0.5">{milestone.name} · {projectName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {result.reused ? 'Existing draft found' : 'Draft created'}: <span className="font-mono">{result.invoiceNumber}</span>
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  Saved as a <b>draft</b> in Zoho Books. <b>Nothing has been sent to the client.</b> Open it in Zoho, check it, and send it from there.
                </p>
              </div>
            </div>
            {mismatch && (
              <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Zoho totals {formatINR(result.total)} but this schedule says {formatINR(result.expectedTotal)}. Check the draft before sending.</span>
              </div>
            )}
            <div className="flex gap-2">
              <a href={result.url} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">
                Open in Zoho Books <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">Done</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* The money, as the schedule has it */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Taxable value</span><span className="font-semibold tabular-nums">{formatINR(amounts.taxable)}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500">{amounts.gstRatePct > 0 ? split.label : 'No GST on this invoice'}</span>
                <span className="font-semibold tabular-nums">{formatINR(amounts.gst)}</span>
              </div>
              {amounts.retainer > 0 && <div className="flex justify-between"><span className="text-slate-500">Less: retainer already paid</span><span className="tabular-nums">−{formatINR(amounts.retainer)}</span></div>}
              {amounts.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Less: concession</span><span className="tabular-nums">−{formatINR(amounts.discount)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="font-bold">Client pays</span><span className="font-bold tabular-nums">{formatINR(amounts.invoiceTotal)}</span></div>
            </div>

            {/* Customer */}
            <div>
              <label className={cap}>Zoho customer</label>
              {contact ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-emerald-900">{contact.name}</span>
                  <button className="text-xs font-bold text-emerald-800 underline" onClick={() => { setContact(null); setHits(null); }}>Change</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input className={field} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search your Zoho customers" />
                    <button onClick={() => search()} disabled={busy === 'search'} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-40">Search</button>
                  </div>
                  {hits && hits.length > 0 && (
                    <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                      {hits.map((h) => (
                        <li key={h.id}>
                          <button onClick={() => choose(h)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                            <span className="font-semibold">{h.name}</span>{h.company && h.company !== h.name && <span className="text-slate-500"> · {h.company}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hits && hits.length === 0 && <p className="text-xs text-slate-500">No customer by that name in Zoho.</p>}
                  <button onClick={createContact} disabled={busy === 'create' || !(client.name || query)} className="text-xs font-bold text-[#3D52A0] underline disabled:opacity-40">
                    {busy === 'create' ? 'Creating…' : `Create “${client.name || query}” in Zoho as a new customer`}
                  </button>
                </div>
              )}
            </div>

            {/* Place of supply */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={cap}>Client GSTIN (optional)</label>
                <input className={`${field} font-mono ${gstinProblem ? 'border-red-300' : ''}`} value={gstin} onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setGstin(v);
                  const st = isValidGstin(v) ? stateFromGstin(v) : null;
                  if (st) setPlace(st.zoho);
                }} placeholder="27ABCDE1234F1Z5" />
                {gstinProblem && <p className="text-[11px] text-red-600 mt-1">That GSTIN does not look right.</p>}
              </div>
              <div>
                <label className={cap}>Place of supply</label>
                <select className={`${field} ${reason === 'place_of_supply' ? 'border-red-300' : ''}`} value={place} onChange={(e) => setPlace(e.target.value)}>
                  <option value="">Choose the client's state</option>
                  {GST_STATES.map((s) => <option key={s.zoho} value={s.zoho}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {!studioState && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Add your studio GSTIN in Studio Settings, so the GST split can be worked out.</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={raise}
                disabled={!contact || !clientState || !studioState || gstinProblem || busy !== null}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-40 transition-colors"
              >
                {busy === 'raise' ? 'Creating draft…' : 'Create draft in Zoho'}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            </div>
            <p className="text-[11px] text-slate-500 -mt-2">Creates a draft only. It is not emailed or marked sent.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZohoRaiseInvoiceDialog;
