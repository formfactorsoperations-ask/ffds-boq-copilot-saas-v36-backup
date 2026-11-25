import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, AlertTriangle } from '@/lib/lucide-shim';
import { Button, INPUT, LABEL, Segmented } from '../ui/kit';
import { emailWarning, formProblems, type ClientForm } from '../../lib/clientEdit';
import type { ClientContact } from '../../lib/clientContacts';

/*
  Edit client / New client (DESIGN.md "Clients: conversations"; built like
  AssignProjectsModal: scrim, pop, a head, a scrolling body and a slate foot).

  Edit writes the details back to every project of the client (lib/clientEdit).
  New starts a lead with the details filled in (owner's decision D1): the
  start window opens on the quick-add form, and a Dummy client becomes a
  practice project. Only name, phone, email and place go with a new client;
  the home, its type and the people are added on the project once it opens.

  For Owner, Admin, Ops Director and Super Admin only (Phase 0, Q3): the
  email is the client's portal username.
*/

const blankPerson = (): ClientContact => ({ id: `c${Math.random().toString(36).slice(2, 9)}`, name: '', role: null, email: null, phone: null });

export default function EditClientModal({ mode, initial, projectCount, primaryName, mergeName, onSave, onClose }: {
  mode: 'edit' | 'new';
  initial: ClientForm;
  /** How many projects the details are written to. */
  projectCount: number;
  /** The project whose name the home field edits. */
  primaryName?: string;
  /** Another client the edit would merge with, worked out from the form. */
  mergeName: (f: ClientForm) => string | null;
  /** Resolves when done; throws to keep the window open. */
  onSave: (f: ClientForm) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState<ClientForm>(initial);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ClientForm>(k: K, v: ClientForm[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const setPerson = (i: number, patch: Partial<ClientContact>) => set('people', f.people.map((p, n) => (n === i ? { ...p, ...patch } : p)));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const problems = useMemo(() => formProblems(f), [f]);
  const warning = mode === 'edit' ? emailWarning(initial, f) : null;
  const merge = mode === 'edit' ? mergeName(f) : null;

  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(f);
    } catch (e: any) {
      setError(e?.message || 'It could not be saved. Try again.');
      setBusy(false);
    }
  };

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="block">
      <span className={`${LABEL} block mb-1.5`}>{label}</span>
      {el}
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={mode === 'edit' ? 'Edit client' : 'New client'}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="phd-pop relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="p-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{mode === 'edit' ? 'Edit client' : 'New client'}</p>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                {mode === 'edit' ? (initial.name || 'This client') : 'Who is the new client?'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'edit'
                  ? `Saved to ${projectCount === 1 ? 'their project' : `all ${projectCount} of their projects`}.`
                  : 'It starts as a lead, with these details filled in.'}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {field('Client name', <input value={f.name} onChange={(e) => set('name', e.target.value)} className={INPUT} autoFocus placeholder="As the client is addressed" />)}
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Phone', <input value={f.phone} onChange={(e) => set('phone', e.target.value)} className={INPUT} inputMode="tel" placeholder="98200 12345" />)}
            {field('Email', <input value={f.email} onChange={(e) => set('email', e.target.value)} className={INPUT} type="email" placeholder="name@example.com" />)}
          </div>
          {mode === 'edit' && field('Home or project name', <input value={f.home} onChange={(e) => set('home', e.target.value)} className={INPUT} />, projectCount > 1 && primaryName ? `For ${primaryName} only; the other projects keep their names.` : undefined)}
          <div className="grid sm:grid-cols-2 gap-3">
            {field('Area / city', <input value={f.place} onChange={(e) => set('place', e.target.value)} className={INPUT} placeholder="Thane" />)}
            {mode === 'edit' && field('Home type', <input value={f.config} onChange={(e) => set('config', e.target.value)} className={INPUT} placeholder="3-BHK" />)}
          </div>
          <div>
            <span className={`${LABEL} block mb-1.5`}>Actual or dummy</span>
            <Segmented<'actual' | 'dummy'> label="Actual or dummy" size="sm" value={f.dummy ? 'dummy' : 'actual'} onChange={(v) => set('dummy', v === 'dummy')}
              options={[{ id: 'actual', label: 'Actual' }, { id: 'dummy', label: 'Dummy' }]} />
            {mode === 'new' && f.dummy && <p className="text-[11px] text-slate-500 mt-1">A dummy client becomes a practice project, kept out of the desk and the numbers.</p>}
          </div>

          {mode === 'edit' && (
            <div className="space-y-2">
              <span className={`${LABEL} block`}>People on this account</span>
              {f.people.length === 0 && <p className="text-xs text-slate-500">Only {f.name || 'the client'} so far.</p>}
              {f.people.map((p, i) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-3 grid sm:grid-cols-2 gap-2 relative">
                  <input value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} className={INPUT} placeholder="Name" aria-label="Name" />
                  <input value={p.role || ''} onChange={(e) => setPerson(i, { role: e.target.value || null })} className={INPUT} placeholder="Role, e.g. Decides" aria-label="Role" />
                  <input value={p.email || ''} onChange={(e) => setPerson(i, { email: e.target.value || null })} className={INPUT} placeholder="Email" aria-label="Email" type="email" />
                  <div className="flex gap-2">
                    <input value={p.phone || ''} onChange={(e) => setPerson(i, { phone: e.target.value || null })} className={INPUT} placeholder="Phone" aria-label="Phone" inputMode="tel" />
                    <button type="button" onClick={() => set('people', f.people.filter((_, n) => n !== i))} aria-label={`Remove ${p.name || 'this person'}`}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="quiet" icon={Plus} onClick={() => set('people', [...f.people, blankPerson()])}>Add a person</Button>
            </div>
          )}

          {mode === 'new' && <p className="text-[11px] text-slate-500">The home, its type and the people on the account are added on the project once it opens.</p>}

          {warning && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />{warning}
            </p>
          )}
          {merge && <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{merge} already has this name and email: saving puts the two together as one client.</p>}
          {tried && problems.length > 0 && (
            <ul className="text-xs font-semibold text-rose-700 space-y-0.5" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {error && <p className="text-xs font-semibold text-rose-700" role="alert">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">Email is what the client signs in to their portal with.</span>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : mode === 'edit' ? 'Save' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
