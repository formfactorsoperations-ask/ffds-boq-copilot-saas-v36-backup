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
  ZohoInvoiceSummary,
  ZohoRaiseResult,
  zohoCall,
} from '../services/zohoBooksService';
import { Dot } from './ui/HudBits';
import './projectHeader/projectHeader.css';

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
 * Or, when the studio already raised this invoice in Zoho by hand, it links
 * that invoice to the milestone instead: the app takes Zoho's number and date
 * and changes nothing in Zoho.
 *
 * The milestone is marked invoiced the moment Zoho has the invoice, so the app
 * and the books cannot disagree about whether it exists. A draft is not sent:
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

type Mode = 'draft' | 'link';

const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const cap = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';
const primary = 'px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50 transition-colors';
const secondary = 'px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50';
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider';

/** Zoho's invoice status, in the studio's tints. */
const statusTint = (s: string) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700'
    : s === 'overdue' ? 'bg-rose-100 text-rose-700'
    : s === 'partially_paid' ? 'bg-amber-100 text-amber-700'
    : s === 'draft' ? 'bg-slate-100 text-slate-600'
    : 'bg-[#3D52A0]/10 text-[#3D52A0]';

/** "2026-11-15" → "15 Nov 2026", read as a calendar date, not a moment. */
const showDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

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
  const [mode, setMode] = useState<Mode>('draft');
  const [invoices, setInvoices] = useState<ZohoInvoiceSummary[] | null>(null);
  const [picked, setPicked] = useState<ZohoInvoiceSummary | null>(null);
  const [busy, setBusy] = useState<'search' | 'create' | 'raise' | 'invoices' | null>(null);
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

  // In link mode, list the chosen customer's invoices; a different customer means a different list.
  useEffect(() => {
    setInvoices(null);
    setPicked(null);
    if (mode !== 'link' || !contact) return;
    let live = true;
    setBusy('invoices');
    setError(null);
    zohoCall<{ invoices: ZohoInvoiceSummary[] }>('listInvoices', { contactId: contact.id }, tenantId)
      .then((r) => { if (live) setInvoices(r.invoices); })
      .catch((e) => { if (live) fail(e); })
      .finally(() => { if (live) setBusy(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, contact?.id]);

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

  const billingNow = (): ClientBilling => ({
    zohoContactId: contact!.id, zohoContactName: contact!.name,
    gstin: isValidGstin(gstinNorm) ? gstinNorm : (billing?.gstin || undefined),
    placeOfSupply: clientState?.zoho || billing?.placeOfSupply,
  });

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
      onRaised(res, billingNow());
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const link = async () => {
    if (!contact || !picked) return;
    setBusy('raise');
    setError(null);
    setReason('');
    try {
      const res = await zohoCall<ZohoRaiseResult>('linkInvoice', {
        projectId, milestoneId: milestone.id, contactId: contact.id, invoiceId: picked.id, expectedTotal: amounts.invoiceTotal,
      }, tenantId);
      setResult(res);
      onRaised(res, billingNow());
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const mismatch = result && Math.abs(result.total - result.expectedTotal) > 1;
  const canDraft = !!contact && !!clientState && !!studioState && !gstinProblem && busy === null;
  const canLink = !!contact && !!picked && busy === null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Raise invoice in Zoho Books">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Zoho Books</p>
            <h3 className="font-bold text-slate-800 mt-1">Raise invoice in Zoho Books</h3>
            <p className="text-xs text-slate-500 mt-0.5">{milestone.name} · {projectName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {result ? (
          <>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {result.linked ? 'Linked' : result.reused ? 'Existing draft found' : 'Draft created'}: <span className="font-mono">{result.invoiceNumber}</span>
                  </p>
                  {result.linked ? (
                    <p className="text-xs text-slate-500 mt-1">
                      This milestone now shows Zoho's invoice number and date. <b className="text-slate-700">Nothing was changed in Zoho Books.</b> Record the client's payments here as usual.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      Saved as a <b className="text-slate-700">draft</b> in Zoho Books. <b className="text-slate-700">Nothing has been sent to the client.</b> Open it in Zoho, check it, and send it from there.
                    </p>
                  )}
                </div>
              </div>
              {mismatch && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Zoho totals {formatINR(result.total)} but this schedule says {formatINR(result.expectedTotal)}. Check the invoice in Zoho.</span>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button type="button" onClick={onClose} className={secondary}>Done</button>
              <a href={result.url} target="_blank" rel="noreferrer" className={`${primary} inline-flex items-center gap-1.5`}>
                Open in Zoho Books <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* The money, as the schedule has it */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Taxable value</span><span className="font-semibold tabular-nums text-slate-800">{formatINR(amounts.taxable)}</span></div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{amounts.gstRatePct > 0 ? split.label : 'No GST on this invoice'}</span>
                  <span className="font-semibold tabular-nums text-slate-800">{formatINR(amounts.gst)}</span>
                </div>
                {amounts.retainer > 0 && <div className="flex justify-between"><span className="text-slate-500">Less: retainer already paid</span><span className="tabular-nums">−{formatINR(amounts.retainer)}</span></div>}
                {amounts.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Less: concession</span><span className="tabular-nums">−{formatINR(amounts.discount)}</span></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="font-bold text-slate-800">Client pays</span><span className="font-bold tabular-nums text-slate-800">{formatINR(amounts.invoiceTotal)}</span></div>
              </div>

              {/* Customer */}
              <div>
                <label className={cap}>Zoho customer</label>
                {contact ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-emerald-900">{contact.name}</span>
                    <button type="button" className="text-xs font-bold text-emerald-800 underline" onClick={() => { setContact(null); setHits(null); }}>Change</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input className={field} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search your Zoho customers" />
                      <button type="button" onClick={() => search()} disabled={busy === 'search'} className={secondary}>Search</button>
                    </div>
                    {hits && hits.length > 0 && (
                      <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                        {hits.map((h, i) => (
                          <li key={h.id} className="hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                            <button type="button" onClick={() => choose(h)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                              <span className="font-semibold text-slate-800">{h.name}</span>{h.company && h.company !== h.name && <span className="text-slate-500"> · {h.company}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {hits && hits.length === 0 && <p className="text-xs text-slate-500">No customer by that name in Zoho.</p>}
                    <button type="button" onClick={createContact} disabled={busy === 'create' || !(client.name || query)} className="text-xs font-bold text-[#3D52A0] underline disabled:opacity-50">
                      {busy === 'create' ? 'Creating…' : `Create “${client.name || query}” in Zoho as a new customer`}
                    </button>
                  </div>
                )}
              </div>

              {/* New draft, or an invoice already raised in Zoho */}
              <div>
                <label className={cap}>Invoice</label>
                <div className="grid grid-cols-2 sm:inline-flex p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Invoice">
                  {([['draft', 'New draft'], ['link', 'Already in Zoho']] as [Mode, string][]).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => { setMode(m); setError(null); setReason(''); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div key={mode} className="hud-swap space-y-3">
                {mode === 'draft' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={cap}>Client GSTIN (optional)</label>
                        <input className={`${field} font-mono ${gstinProblem ? 'border-rose-300' : ''}`} value={gstin} onChange={(e) => {
                          const v = e.target.value.toUpperCase();
                          setGstin(v);
                          const st = isValidGstin(v) ? stateFromGstin(v) : null;
                          if (st) setPlace(st.zoho);
                        }} placeholder="27ABCDE1234F1Z5" />
                        {gstinProblem && <p className="text-[11px] text-rose-600 mt-1">That GSTIN does not look right.</p>}
                      </div>
                      <div>
                        <label className={cap}>Place of supply</label>
                        <select className={`${field} ${reason === 'place_of_supply' ? 'border-rose-300' : ''}`} value={place} onChange={(e) => setPlace(e.target.value)}>
                          <option value="">Choose the client's state</option>
                          {GST_STATES.map((s) => <option key={s.zoho} value={s.zoho}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {!studioState && (
                      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Add your studio GSTIN in Studio Settings, so the GST split can be worked out.</span>
                      </div>
                    )}
                  </>
                ) : !contact ? (
                  <p className="text-xs text-slate-500">Choose the Zoho customer above first. Their invoices will be listed here.</p>
                ) : busy === 'invoices' ? (
                  <p className="text-xs text-slate-500 inline-flex items-center gap-2"><Dot tone="ok" live /> Looking up {contact.name}'s invoices in Zoho…</p>
                ) : invoices && invoices.length === 0 ? (
                  <p className="text-xs text-slate-500">Zoho has no invoices for {contact.name} yet. Create a new draft instead.</p>
                ) : invoices ? (
                  <>
                    <p className="text-[11px] text-slate-500">Pick the invoice you raised in Zoho for this milestone. Its number and date come across; nothing in Zoho changes.</p>
                    <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {invoices.map((inv, i) => {
                        const on = picked?.id === inv.id;
                        return (
                          <li key={inv.id} className="hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                            <button
                              type="button"
                              onClick={() => setPicked(inv)}
                              aria-pressed={on}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${on ? 'bg-[#3D52A0]/10' : 'hover:bg-slate-50'}`}
                            >
                              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${on ? 'border-[#3D52A0] bg-[#3D52A0] shadow-[inset_0_0_0_2px_#fff]' : 'border-slate-300'}`} />
                              <span className="flex-1 min-w-0 leading-tight">
                                <span className="block text-sm font-semibold text-slate-800 tabular-nums truncate">{inv.number}</span>
                                <span className="block text-[11px] text-slate-500">{showDate(inv.date)}</span>
                              </span>
                              <span className="text-sm font-semibold tabular-nums text-slate-800">{formatINR(inv.total)}</span>
                              <span className={`${chip} ${statusTint(inv.status)}`}>{inv.status.replace(/_/g, ' ')}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {picked && Math.abs(picked.total - amounts.invoiceTotal) > 1 && (
                      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{picked.number} is {formatINR(picked.total)}, but this schedule says the client pays {formatINR(amounts.invoiceTotal)}. Make sure it is the right invoice.</span>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                {mode === 'draft' ? 'Creates a draft only. It is not emailed or marked sent.' : 'Links the invoice to this milestone. Zoho is not changed.'}
              </p>
              <div className="flex justify-end gap-2 shrink-0">
                <button type="button" onClick={onClose} className={secondary}>Cancel</button>
                {mode === 'draft' ? (
                  <button type="button" onClick={raise} disabled={!canDraft} className={primary}>
                    {busy === 'raise' ? 'Creating draft…' : 'Create draft in Zoho'}
                  </button>
                ) : (
                  <button type="button" onClick={link} disabled={!canLink} className={primary}>
                    {busy === 'raise' ? 'Linking…' : picked ? `Link ${picked.number}` : 'Link invoice'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ZohoRaiseInvoiceDialog;
