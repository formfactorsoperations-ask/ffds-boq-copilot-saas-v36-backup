import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, KeyRound, Copy, RefreshCw, Eye, Check, MessageCircle, ShieldOff } from '@/lib/lucide-shim';
import { Button, Chip, LABEL } from '../ui/kit';
import { clientPeople, normEmail, splitEmails } from '../../lib/clientContacts';
import type { PortalLine } from '../../lib/portalVisits';
import type { FullProjectData } from '../../types';
import ClientPeoplePanel from './ClientPeoplePanel';
import { PortalLineText, whatsAppLink } from './parts';
import { portalStateOf } from './ClientCard';
import { giveAccess, inviteText, portalLink, removeAccess, resetPassword, type Issued, type SaveProject } from './portalActions';

/*
  The client portal window (DESIGN.md "Clients: conversations"; handoff 5.6),
  built like AssignProjectsModal. For Owner, Admin, Ops Director and Super
  Admin only: the roles the login functions accept.

  One project at a time (a picker when the client has several): its state,
  its status line and the email they sign in with (Change opens Edit client).
  Then, as today (owner's decision D4): Give access, Reset password (a second
  click within 5 seconds; the temporary password is shown once), Copy portal
  link, Reissue link (the old one stops working) and See it as the client
  (the project's own preview). With more than one person on the account, each
  has their own login, in the project's people panel. Remove access is a rose
  button that asks again.

  The invite and a new password are shared on WhatsApp (the link and the
  username; the password only when ticked) or copied. Nothing here adds a
  portal tab.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export default function ClientPortalModal({
  clientName, clientPhone, projects, initialProjectId, tenantId, studioName, me, save, portalLines, focus, onChangeEmail, onOpenProject, onClose,
}: {
  clientName: string;
  clientPhone: string;
  /** The client's projects, the liveliest first. */
  projects: FullProjectData[];
  initialProjectId: string;
  tenantId: string;
  studioName: string;
  /** Who is doing it, for the portal marks. */
  me: string | null;
  save: SaveProject;
  portalLines: Array<{ projectId: string; name: string; line: PortalLine }>;
  /** Opened from the card's Reset password: that button starts armed. */
  focus?: 'reset' | null;
  onChangeEmail: () => void;
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const project = projects.find((p) => p.id === projectId) || projects[0];
  const ctx: any = project?.context || {};
  const email = splitEmails(ctx.clientEmail)[0] || '';
  const mark = email ? ctx.clientPortal?.[normEmail(email)] : null;
  const on = !!(mark?.issuedAt && !mark?.revokedAt);
  const state = portalStateOf([project]);
  const line = portalLines.find((x) => x.projectId === project?.id)?.line || null;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [withPassword, setWithPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  /* Reset, Reissue and Remove replace what the client has: each takes a second click within 5 seconds. */
  const [armed, setArmed] = useState<'reset' | 'reissue' | 'remove' | null>(focus === 'reset' ? 'reset' : null);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);
  useEffect(() => { setIssued(null); setError(null); setArmed(null); setCopied(null); }, [projectId]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  /* The link, once known or made, per project: a second one is never minted by accident (that would stop the first). */
  const links = useRef<Record<string, string>>({});
  const linkFor = async (fresh = false) => {
    if (!fresh && links.current[project.id]) return links.current[project.id];
    const url = await portalLink(project, save, fresh);
    links.current[project.id] = url;
    return url;
  };

  const flash = (what: string) => { setCopied(what); window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500); };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard?.writeText(text); } catch { /* shown as copied all the same */ }
    flash(what);
  };
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e?.message || 'That did not go through. Try again.'); } finally { setBusy(null); }
  };

  const doGive = () => run('give', async () => { setIssued(await giveAccess(project, email, clientName, tenantId, me, save)); setWithPassword(false); });
  const doReset = () => {
    if (armed !== 'reset') { setArmed('reset'); return; }
    setArmed(null);
    void run('reset', async () => { setIssued(await resetPassword(project, email, tenantId, me, save)); setWithPassword(false); });
  };
  const doCopyLink = () => run('link', async () => copy(await linkFor(), 'link'));
  const doReissue = () => {
    if (armed !== 'reissue') { setArmed('reissue'); return; }
    setArmed(null);
    void run('reissue', async () => copy(await linkFor(true), 'reissue'));
  };
  const doRemove = () => {
    if (armed !== 'remove') { setArmed('remove'); return; }
    setArmed(null);
    void run('remove', async () => { await removeAccess(project, email, tenantId, me, save); setIssued(null); });
  };

  /* The invite: link and username, and the password only when ticked (off by default). */
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => {
    if (!issued) { setInvite(null); return; }
    let live = true;
    linkFor().then((link) => {
      if (live) setInvite(inviteText({ clientName, studioName, link, email: issued.email, password: withPassword ? issued.password : null }));
    }).catch(() => { if (live) setInvite(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issued, withPassword, project?.id]);
  const wa = invite ? whatsAppLink(clientPhone, invite) : null;

  /*
    The project's people panel (components/clients/ClientPeoplePanel), for a
    client with more than one person or project. It edits a copy of the
    project's context: a portal change is saved at once, typing after a pause.
  */
  const people = useMemo(() => clientPeople(ctx), [ctx]);
  const showPeople = projects.length > 1 || people.length > 1;
  const [local, setLocal] = useState<any>(ctx);
  const localRef = useRef<any>(ctx);
  useEffect(() => { localRef.current = project?.context || {}; setLocal(localRef.current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [project?.id]);
  const typing = useRef<number | null>(null);
  useEffect(() => () => { if (typing.current) window.clearTimeout(typing.current); }, []);
  const setPanelContext = (fn: (prev: any) => any) => {
    const prev = localRef.current;
    const next = fn(prev);
    localRef.current = next;
    setLocal(next);
    const portalChanged = JSON.stringify(next?.clientPortal || {}) !== JSON.stringify(prev?.clientPortal || {});
    const patch = { clientContacts: next?.clientContacts || [], clientPortal: next?.clientPortal || {} };
    const write = () => { void save(project.id, patch).catch((e) => setError(e?.message || 'It could not be saved.')); };
    if (typing.current) window.clearTimeout(typing.current);
    if (portalChanged) write();
    else typing.current = window.setTimeout(write, 900);
  };

  const tile = (icon: React.ElementType, title: string, sub: string, onClick: () => void, opts: { busyKey?: string; armedLabel?: string | null; doneLabel?: string | null; disabled?: boolean } = {}) => {
    const Icon = icon;
    return (
      <button type="button" onClick={onClick} disabled={!!busy || opts.disabled}
        className={cx('text-left rounded-xl border px-3 py-3 transition-colors disabled:opacity-50', opts.armedLabel ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-[#3D52A0]/40 hover:bg-slate-50')}>
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon className="w-4 h-4 text-[#3D52A0]" aria-hidden />
          {busy === opts.busyKey ? 'Working…' : opts.doneLabel || opts.armedLabel || title}
        </span>
        <span className="block text-[11px] text-slate-500 mt-0.5">{sub}</span>
      </button>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Client portal">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="p-5 pb-4 border-b border-slate-100 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Client portal</p>
              <h3 className="text-base font-bold text-slate-900 mt-1 flex flex-wrap items-center gap-2">{clientName}<Chip tone={state.tone}>{state.label}</Chip></h3>
            </div>
            <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="w-4 h-4" /></button>
          </div>
          {projects.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className={LABEL}>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-2 py-1 rounded-lg border border-slate-300 text-sm" aria-label="Project">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.context?.name || 'Untitled project'}</option>)}
              </select>
            </label>
          )}
          {portalLines.length > 0 && (
            <ul className="space-y-0.5">
              {portalLines.map((x) => <li key={x.projectId}><PortalLineText line={x.line} prefix={portalLines.length > 1 ? x.name : null} /></li>)}
            </ul>
          )}
          <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
            {email ? <>Signs in with <b className="font-semibold text-slate-700 break-all">{email}</b></> : 'No client email on this project yet.'}
            <button type="button" onClick={onChangeEmail} className="font-bold text-[#3D52A0] hover:underline">{email ? 'Change' : 'Add email'}</button>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!email ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-amber-800 flex-1">Add a client email to this project first — it is their username.</p>
              <Button size="sm" onClick={onChangeEmail}>Add email</Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {on
                ? tile(KeyRound, 'Reset password', 'A new temporary password, shown once. They must change it at first sign-in.', doReset, { busyKey: 'reset', armedLabel: armed === 'reset' ? 'Click again to reset' : null })
                : tile(KeyRound, 'Give access', 'Creates their login with a temporary password. Email is the username.', doGive, { busyKey: 'give' })}
              {tile(Copy, 'Copy portal link', 'Their own link to the sign-in page, with your studio on it.', doCopyLink, { busyKey: 'link', doneLabel: copied === 'link' ? 'Link copied' : null })}
              {tile(RefreshCw, 'Reissue link', 'A new link. The old link stops working.', doReissue, { busyKey: 'reissue', armedLabel: armed === 'reissue' ? 'Click again: the old link stops' : null, doneLabel: copied === 'reissue' ? 'New link copied' : null })}
              {tile(Eye, 'See it as the client', "The project's portal preview, as they see it.", () => { onClose(); onOpenProject(project, 'client-portal'); })}
            </div>
          )}

          {issued && (
            <div className="rounded-xl border border-slate-200 overflow-hidden hud-swap">
              <div className="grid sm:grid-cols-2">
                <div className="px-3 py-2 bg-slate-50">
                  <p className={LABEL}>Username</p>
                  <p className="text-sm font-bold text-slate-800 break-all">{issued.email}</p>
                </div>
                <div className="px-3 py-2 bg-slate-50 sm:border-l border-t sm:border-t-0 border-slate-100">
                  <p className={LABEL}>Temporary password</p>
                  <p className="text-sm font-black text-slate-800 tabular-nums select-all">{issued.password}</p>
                </div>
              </div>
              <p className="px-3 py-2 border-t border-slate-100 text-[11px] text-amber-800 bg-amber-50">
                Shown once: it cannot be looked up later. They must change it at first sign-in.
              </p>
              <div className="px-3 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer mr-auto">
                  <input type="checkbox" checked={withPassword} onChange={(e) => setWithPassword(e.target.checked)} className="accent-[#3D52A0]" />
                  Include the password
                </label>
                <Button size="sm" icon={copied === 'invite' ? Check : Copy} disabled={!invite} onClick={() => invite && copy(invite, 'invite')}>{copied === 'invite' ? 'Copied' : 'Copy'}</Button>
                <Button size="sm" variant="primary" icon={MessageCircle} disabled={!wa} title={wa ? 'Opens WhatsApp with the invite' : 'Add a phone number first'}
                  onClick={() => wa && window.open(wa, '_blank', 'noopener,noreferrer')}>Share on WhatsApp</Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-semibold text-rose-700" role="alert">{error}</p>}

          {showPeople && (
            <div className="space-y-2">
              <p className={LABEL}>{projects.length > 1 ? `Everyone's own login on ${project?.context?.name || 'this project'}` : "Everyone's own login"}</p>
              <ClientPeoplePanel projectContext={local} setProjectContext={setPanelContext} projectId={project?.id} />
            </div>
          )}

          <p className="text-xs text-slate-500">They'll see the portal tabs you've already approved for clients. Nothing new is added.</p>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          {on && email ? (
            <Button variant="danger" size="sm" icon={ShieldOff} onClick={doRemove} disabled={!!busy}>
              {busy === 'remove' ? 'Removing…' : armed === 'remove' ? `Click again to remove ${email}` : 'Remove access'}
            </Button>
          ) : <span />}
          <Button onClick={onClose} disabled={!!busy}>Done</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
