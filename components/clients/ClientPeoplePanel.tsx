import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Users, Plus, Trash2, KeyRound, X, Loader2, Copy, Check, ShieldOff } from '@/lib/lucide-shim';
import { functions as fbFunctions } from '../../services/firebaseClient';
import { useOrg } from '../../contexts/OrgContext';
import { hasRole } from '../../lib/roles';
import {
  clientPeople, contactProblems, isEmail, withPortalMark, type ClientContact, type ClientPerson,
} from '../../lib/clientContacts';
import '../projectHeader/projectHeader.css';

/*
  EVERYONE ON THE CLIENT'S SIDE (lib/clientContacts.ts), in the project brief.

  The main contact is the name, email and phone above it, as before. Here the
  studio adds the others -- a spouse, a parent, their architect -- each with
  their own email and phone, and gives any of them their own portal login, or
  takes it away. Logins are issued by the server, by an Owner, Admin or Ops
  Director, exactly as the single login was.
*/

const PORTAL_ROLES = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];
const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';
const btnSm = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';

export default function ClientPeoplePanel({ projectContext, setProjectContext, projectId }: {
  projectContext: any;
  setProjectContext: (fn: (prev: any) => any) => void;
  projectId?: string;
}) {
  const { orgData, currentRole, currentRoles, currentUserAuth } = useOrg() as any;
  const canPortal = hasRole(currentRoles?.length ? currentRoles : [currentRole], PORTAL_ROLES) && !!projectId;
  const people = useMemo(() => clientPeople(projectContext), [projectContext]);
  const problems = useMemo(() => contactProblems(projectContext), [projectContext]);
  const others: ClientContact[] = Array.isArray(projectContext?.clientContacts) ? projectContext.clientContacts : [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; email: string; password: string; reissued: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const setOthers = (next: ClientContact[]) => setProjectContext((prev: any) => ({ ...prev, clientContacts: next }));
  const update = (id: string, patch: Partial<ClientContact>) => setOthers(others.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const add = () => setOthers([...others, { id: `cc-${Date.now().toString(36)}`, name: '', role: '', email: '', phone: '' }]);
  const remove = (id: string) => setOthers(others.filter((c) => c.id !== id));

  const call = async (p: ClientPerson, what: 'issue' | 'reset' | 'revoke') => {
    if (!p.email || !projectId) return;
    if (!fbFunctions) { setError('Cannot reach the server. Check your connection and try again.'); return; }
    setBusy(`${what}:${p.email}`);
    setError(null);
    try {
      const tenantId = orgData?.tenantId || 'demo-tenant-01';
      const fn = httpsCallable(fbFunctions, what === 'issue' ? 'createClientLogin' : what === 'reset' ? 'resetClientPassword' : 'revokeClientLogin');
      const res: any = await fn({ email: p.email, projectId, tenantId, clientName: p.name });
      const by = String(currentUserAuth?.email || '') || null;
      setProjectContext((prev: any) => withPortalMark(prev, p.email!, what !== 'revoke', by));
      if (what !== 'revoke') setIssued({ name: p.name, email: res?.data?.email || p.email, password: res?.data?.tempPassword || '', reissued: what === 'reset' });
      setCopied(false);
    } catch (e: any) {
      setError(e?.message || 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const portalCell = (p: ClientPerson) => {
    if (!p.email) return <span className="text-[11px] text-slate-400">Add an email for a portal login</span>;
    const state = p.portal === 'on'
      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Portal on</span>
      : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">No portal</span>;
    if (!canPortal) return state;
    const spin = (w: string) => busy === `${w}:${p.email}`;
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {state}
        {p.portal === 'on' ? (
          <>
            <button type="button" className={btnSm} disabled={!!busy} onClick={() => call(p, 'reset')} title="Issue a new temporary password">
              {spin('reset') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}New password
            </button>
            <button type="button" className={btnSm} disabled={!!busy} onClick={() => call(p, 'revoke')} title="This project disappears from their login">
              {spin('revoke') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}Remove access
            </button>
          </>
        ) : (
          <button type="button" className={btnSm} disabled={!!busy || !isEmail(p.email)} onClick={() => call(p, 'issue')}
            title="Creates their login. If they already have one (from the Clients page), it gives them a new temporary password.">
            {spin('issue') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}Give portal access
          </button>
        )}
      </span>
    );
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in">
      <header className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Users className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800">Client contacts</h3>
          <p className="text-xs text-slate-500 mt-0.5">Everyone on the client's side. Each email can have its own portal login. Minutes and updates are emailed to all of them; the main contact signs agreements.</p>
        </div>
        <button type="button" className={btnSm} onClick={add}><Plus className="w-3.5 h-3.5" />Add a person</button>
      </header>

      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {people.filter((p) => p.main || p.id.startsWith('main-')).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
            <div className="min-w-[160px] flex-1">
              <p className="text-sm font-semibold text-slate-800">{p.name}</p>
              <p className="text-[11px] text-slate-500">{p.main ? 'Main contact · from the fields above' : 'From the email field above'}</p>
            </div>
            <div className="min-w-[180px] flex-1 text-sm text-slate-700 truncate">{p.email || <span className="text-slate-400">No email</span>}</div>
            {p.main && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#3D52A0]/10 text-[#3D52A0]">Main</span>}
            <div className="ml-auto">{portalCell(p)}</div>
          </div>
        ))}
        {others.map((c) => {
          const p = people.find((x) => x.id === c.id) || { ...c, main: false, portal: 'none' as const, name: c.name || '' };
          return (
            <div key={c.id} className="px-3 py-3 space-y-2 hud-row-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div><label className={label} htmlFor={`cn-${c.id}`}>Name</label><input id={`cn-${c.id}`} className={input} value={c.name} placeholder="Mrs Mrunal Naik" onChange={(e) => update(c.id, { name: e.target.value })} /></div>
                <div><label className={label} htmlFor={`cr-${c.id}`}>Who they are</label><input id={`cr-${c.id}`} className={input} value={c.role || ''} placeholder="Decides with him" onChange={(e) => update(c.id, { role: e.target.value })} /></div>
                <div><label className={label} htmlFor={`ce-${c.id}`}>Email</label><input id={`ce-${c.id}`} type="email" className={`${input} ${c.email && !isEmail(c.email) ? 'border-rose-300' : ''}`} value={c.email || ''} placeholder="name@example.com" onChange={(e) => update(c.id, { email: e.target.value.trim() })} /></div>
                <div><label className={label} htmlFor={`cp-${c.id}`}>Phone</label><input id={`cp-${c.id}`} className={input} value={c.phone || ''} placeholder="+91 98765 43210" onChange={(e) => update(c.id, { phone: e.target.value })} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-700" onClick={() => remove(c.id)} disabled={p.portal === 'on'}
                  title={p.portal === 'on' ? 'Remove their portal access first' : 'Remove this person'}>
                  <Trash2 className="w-3.5 h-3.5" />Remove
                </button>
                <span className="flex-1" />
                {portalCell(p as ClientPerson)}
              </div>
            </div>
          );
        })}
        {!people.length && !others.length && <p className="px-3 py-3 text-xs text-slate-500">Add the client's name and email above first.</p>}
      </div>
      {problems.length > 0 && <ul className="mt-3 space-y-1">{problems.map((t) => <li key={t} className="text-xs text-amber-800">{t}</li>)}</ul>}
      {!canPortal && <p className="text-[11px] text-slate-500 mt-3">An Owner, Admin or Ops Director gives portal access.</p>}
      {error && <p className="mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      {issued && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Portal login">
          <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => setIssued(null)} />
          <div className="phd-pop relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{issued.reissued ? 'New password' : 'Portal login'}</p>
                  <h3 className="text-lg font-bold text-slate-800">{issued.name}</h3>
                  <p className="text-xs text-slate-500">Send these to them. They choose their own password when they first sign in.</p>
                </div>
                <button type="button" onClick={() => setIssued(null)} aria-label="Close" className="w-9 h-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
              </div>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div className="px-3 py-2"><p className={label}>Email</p><p className="text-sm font-semibold text-slate-800 break-all">{issued.email}</p></div>
                <div className="px-3 py-2"><p className={label}>Temporary password</p><p className="text-sm font-black text-slate-800 tabular-nums select-all">{issued.password}</p></div>
              </div>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This password is shown once and cannot be looked up later. Copy it now.</p>
            </div>
            <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
              <button type="button" className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50" onClick={() => setIssued(null)}>Done</button>
              <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]" onClick={async () => {
                try { await navigator.clipboard?.writeText(`Email: ${issued.email}\nTemporary password: ${issued.password}`); setCopied(true); } catch { setCopied(false); }
              }}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy both'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
