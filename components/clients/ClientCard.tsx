import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Phone, Mail, MapPin, KeyRound, Copy, RefreshCw, Check, NotebookPen, ArrowRight, Pencil } from '@/lib/lucide-shim';
import { Button, Chip, LABEL, type Tone } from '../ui/kit';
import { StageChip } from '../projects/journey/parts';
import { stageOfProject } from '../../lib/projectFolders';
import { clientPeople, normEmail, type ClientPerson, type PortalAccessMark } from '../../lib/clientContacts';
import { formatINR } from '../../lib/utils';
import { publicAppOrigin } from '../../lib/publicUrl';
import { issuePortalAccess, portalTokenOf } from '../../services/portalAccessService';
import { db } from '../../services/dbService';
import { functions as fbFunctions } from '../../services/firebaseClient';
import type { FullProjectData } from '../../types';
import type { ClientRow } from '../../lib/clientList';
import { ClientPhoto, PortalLineText } from './parts';
import type { PortalLine } from '../../lib/portalVisits';

/*
  The client card (DESIGN.md "Clients: conversations"): the photo, name and
  stage, then Details, Client portal, People on this account, Next move,
  Money and Dossier & notes, divided by slate-100 rules. Read-only: editing
  the client comes with the Edit client window.

  The portal buttons are for Owner, Admin and Ops Director (and Super Admin):
  the roles the login callables accept (functions/src/index.ts
  CLIENT_LOGIN_ROLES). Everyone else sees the state only. A login is an email
  and a temporary password the studio issues, made on the server so the
  studio is never signed out of its own account.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** Where the client's portal stands, across their projects, from what the studio has recorded. */
export function portalStateOf(projects: FullProjectData[]): { label: string; tone: Tone } {
  const marks = projects.flatMap((p) => Object.values(((p.context as any)?.clientPortal || {}) as Record<string, PortalAccessMark>));
  if (marks.some((m) => m?.issuedAt && !m?.revokedAt)) return { label: 'Active', tone: 'good' };
  if (marks.length > 0 && marks.every((m) => m?.revokedAt)) return { label: 'Revoked', tone: 'bad' };
  if (projects.some((p) => portalTokenOf(p.context))) return { label: 'Invite sent', tone: 'warn' };
  return { label: 'No access', tone: 'slate' };
}

/** Everyone on the client's side across their projects, each once (by email, else by name). */
export function peopleOf(projects: FullProjectData[]): ClientPerson[] {
  const out: ClientPerson[] = [];
  const seen = new Set<string>();
  for (const p of projects) {
    for (const person of clientPeople(p.context)) {
      const key = person.email ? normEmail(person.email) : `name:${person.name.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(person);
    }
  }
  return out;
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className={LABEL}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const NEXT_TONE: Record<'warn' | 'go' | 'plain', string> = {
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  go: 'bg-[#3D52A0]/5 text-[#334486] border-[#3D52A0]/20',
  plain: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function ClientCard({ row, tenantId, canPortal, onOpenProject, onOpenDossier, portalLines = [], onEdit }: {
  row: ClientRow;
  tenantId: string;
  /** Owner, Admin, Ops Director, Super Admin: may give, reset and copy portal access. */
  canPortal: boolean;
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  onOpenDossier: () => void;
  /** Each project's portal status line (lib/portalVisits); Viewer's carry no visits. */
  portalLines?: Array<{ projectId: string; name: string; line: PortalLine }>;
  /** Owner, Admin, Ops Director, Super Admin: Edit client. */
  onEdit?: () => void;
}) {
  const c = row.client;
  const p = row.primary;
  const ctx: any = p?.context || {};
  const people = useMemo(() => peopleOf(c.projects), [c.projects]);
  const portal = portalStateOf(c.projects);
  const loginEmail = String(ctx.clientEmail || c.clientEmail || '').split(',')[0].trim();

  /* ── Portal actions, as the old directory had them ─────────────────────── */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string; reissued: boolean } | null>(null);
  const [copiedBoth, setCopiedBoth] = useState(false);
  const [copied, setCopied] = useState<'link' | 'newlink' | null>(null);
  /* Reset and Reissue replace what the client already has, so each takes a second click within five seconds. */
  const [armed, setArmed] = useState<'reset' | 'reissue' | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);
  useEffect(() => { setIssued(null); setError(null); setArmed(null); setCopied(null); }, [c.clientKey]);

  const login = async (reset: boolean) => {
    if (!loginEmail) { setError('Add a client email to this project first — it is their username.'); return; }
    if (!fbFunctions) { setError('Cannot reach the server. Check your connection and try again.'); return; }
    setError(null);
    setBusy(reset ? 'reset' : 'give');
    try {
      const fn = httpsCallable(fbFunctions, reset ? 'resetClientPassword' : 'createClientLogin');
      const res: any = await fn({ email: loginEmail, projectId: p.id, tenantId, clientName: c.clientName });
      setIssued({ email: res?.data?.email || loginEmail, password: res?.data?.tempPassword || '', reissued: reset });
      setCopiedBoth(false);
    } catch (e: any) {
      setError(e?.message || 'Could not set up the login. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  /* The link is `?portal=<token>`. A new one is minted only on Reissue, or when none exists; reissuing stops the old one working. */
  const copyLink = async (fresh: boolean) => {
    let token = fresh ? null : portalTokenOf(p.context);
    if (!token) {
      const access = issuePortalAccess(p.id, ctx.clientEmail);
      token = access.token;
      try {
        await db.saveProject({ ...p, context: { ...ctx, portalAccess: access }, lastModified: Date.now() } as FullProjectData);
      } catch (e) {
        console.error('Could not save the portal link:', e);
      }
    }
    try { await navigator.clipboard?.writeText(`${publicAppOrigin()}/?portal=${token}`); } catch { /* shown as copied all the same */ }
    setCopied(fresh ? 'newlink' : 'link');
    window.setTimeout(() => setCopied(null), 2500);
  };

  const money = row.money;

  return (
    <div className="flex flex-col">
      <ClientPhoto project={p} className="w-full h-40" />
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">{c.clientName}</h2>
          {onEdit && <Button size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {[ctx.name, ctx.config, ctx.location].filter(Boolean).join(' · ') || 'No details yet'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5"><StageChip stage={stageOfProject(p)} /></div>
      </div>

      <Section title="Details">
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-center gap-2.5 min-w-0">
            <Phone className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
            {c.clientPhone
              ? <a href={`tel:${c.clientPhone.replace(/\s+/g, '')}`} className="truncate hover:text-[#3D52A0]">{c.clientPhone}</a>
              : <button type="button" onClick={() => (onEdit ? onEdit() : onOpenProject(p))} className="text-xs font-bold text-[#3D52A0] hover:underline">Add phone</button>}
          </li>
          <li className="flex items-center gap-2.5 min-w-0">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
            {c.clientEmail
              ? <a href={`mailto:${c.clientEmail}`} className="truncate hover:text-[#3D52A0]">{c.clientEmail}</a>
              : <button type="button" onClick={() => (onEdit ? onEdit() : onOpenProject(p))} className="text-xs font-bold text-[#3D52A0] hover:underline">Add email</button>}
          </li>
          <li className="flex items-center gap-2.5 min-w-0">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
            <span className="truncate">{c.clientLocation || 'No place yet'}</span>
          </li>
        </ul>
      </Section>

      <Section title="Client portal" aside={<Chip tone={portal.tone}>{portal.label}</Chip>}>
        {portalLines.length > 0 && (
          <ul className="space-y-1 mb-2">
            {portalLines.map((x) => (
              <li key={x.projectId}><PortalLineText line={x.line} prefix={portalLines.length > 1 ? x.name : null} /></li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          {loginEmail ? <>Signs in with <span className="font-semibold text-slate-700 break-all">{loginEmail}</span></> : 'Add a client email first — it is their username.'}
        </p>
        {canPortal && (
          <div className="mt-3 flex flex-wrap gap-2">
            {portal.label === 'Active' ? (
              <Button size="sm" icon={KeyRound} disabled={busy != null}
                onClick={() => { if (armed !== 'reset') { setArmed('reset'); return; } setArmed(null); login(true); }}>
                {busy === 'reset' ? 'Resetting…' : armed === 'reset' ? 'Confirm reset' : 'Reset password'}
              </Button>
            ) : (
              <Button size="sm" icon={KeyRound} disabled={busy != null} onClick={() => login(false)}>
                {busy === 'give' ? 'Giving access…' : 'Give access'}
              </Button>
            )}
            <Button size="sm" icon={copied === 'link' ? Check : Copy} onClick={() => copyLink(false)}>
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </Button>
            <Button size="sm" variant="quiet" icon={copied === 'newlink' ? Check : RefreshCw}
              title="Replace the client's link with a new one. The old link stops working."
              onClick={() => { if (armed !== 'reissue') { setArmed('reissue'); return; } setArmed(null); copyLink(true); }}>
              {copied === 'newlink' ? 'New link copied' : armed === 'reissue' ? 'Confirm reissue' : 'Reissue link'}
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{error}</p>}
        {issued && (
          /* Shown once: Firebase Auth keeps only a hash, so a lost password is reset, never looked up. */
          <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden hud-swap">
            <div className="px-3 py-2 bg-slate-50">
              <p className={LABEL}>Email</p>
              <p className="text-xs font-bold text-slate-800 break-all">{issued.email}</p>
            </div>
            <div className="px-3 py-2 border-t border-slate-100">
              <p className={LABEL}>Temporary password</p>
              <p className="text-sm font-black text-slate-800 tabular-nums select-all">{issued.password}</p>
            </div>
            <p className="px-3 py-2 border-t border-slate-100 text-[11px] text-amber-800 bg-amber-50">
              Shown once. They must change it at first sign-in.
            </p>
            <div className="px-3 py-2 border-t border-slate-100 flex justify-end gap-2">
              <Button size="sm" onClick={() => setIssued(null)}>Done</Button>
              <Button size="sm" variant="primary" onClick={async () => {
                try { await navigator.clipboard?.writeText(`Email: ${issued.email}\nTemporary password: ${issued.password}`); setCopiedBoth(true); } catch { setCopiedBoth(false); }
              }}>{copiedBoth ? 'Copied' : 'Copy both'}</Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="People on this account">
        {people.length === 0 ? (
          <p className="text-xs text-slate-500">No one recorded yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {people.map((person) => (
              <li key={person.id + (person.email || '')} className="flex items-center gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{person.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{[person.main ? 'Main contact' : person.role, person.email].filter(Boolean).join(' · ') || 'No email'}</p>
                </div>
                {person.phone && (
                  <a href={`tel:${person.phone.replace(/\s+/g, '')}`} aria-label={`Call ${person.name}`} title={person.phone}
                    className="p-2 rounded-full border border-slate-200 text-slate-500 hover:text-[#3D52A0] hover:border-[#3D52A0]/40">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Next move">
        <div className={cx('rounded-xl border px-3 py-2.5', NEXT_TONE[row.nextMove.tone])}>
          <p className="text-sm font-bold">{row.nextMove.label}</p>
          {row.nextMove.why && <p className="text-xs mt-0.5 opacity-90">{row.nextMove.why}</p>}
        </div>
      </Section>

      {!money.hidden && (
        <Section title="Money">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[11px] text-slate-500">Portfolio</dt>
              <dd className="text-sm font-bold text-slate-800 tabular-nums">{formatINR(money.portfolio || 0)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Owed now</dt>
              <dd className={cx('text-sm font-bold tabular-nums', (money.owedNow || 0) > 0 ? 'text-rose-700' : 'text-slate-800')}>{formatINR(money.owedNow || 0)}</dd>
            </div>
          </dl>
        </Section>
      )}

      <Section title="Dossier & notes">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={NotebookPen} onClick={onOpenDossier}>Open dossier & notes</Button>
          <Button size="sm" variant="quiet" icon={ArrowRight} onClick={() => onOpenProject(p)}>Open project</Button>
        </div>
      </Section>
    </div>
  );
}
