/*
  Who works at this studio.

  `organizations/{tenantId}.team` is read in six places — it decides each
  person's role when they sign in, fills the Site Supervisor picker on a
  project, and titles the designer on client emails — and until now nothing in
  the app wrote it. On the live studio the field did not exist at all, so the
  supervisor picker was permanently empty, every email said "Architect", and
  the sign-in role sync never ran. The roster people did see came from a
  hardcoded demo list of three invented names.

  This is that missing editor. It writes the real thing, and it can read the
  accounts that actually exist rather than asking anyone to retype them.
*/

import React, { useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../services/firebaseClient';
import { TeamMember, UserRole } from '../../types';
import { Plus, Trash2, UserPlus, Users, Download, AlertTriangle, Check } from 'lucide-react';
import { createStaffLogin, StaffLogin } from '../../services/studioAccess';
import { useProjectDirectory, useProjectTeam } from '../../services/projectTeam';
import AssignProjectsModal from '../projectHeader/AssignProjectsModal';

const ROLES: UserRole[] = ['Super Admin', 'Admin', 'Ops Director', 'Designer', 'Site Supervisor', 'Viewer', 'Client'] as UserRole[];

/** What each role can reach, said plainly rather than as a permission matrix. */
const ROLE_BLURB: Record<string, string> = {
  'Super Admin': 'Everything, across every studio on the platform',
  'Admin': 'Everything in this studio, including settings and money',
  'Ops Director': 'Projects, settings and margins — no platform access',
  'Designer': 'Projects and BOQs; cannot see studio settings',
  'Site Supervisor': 'Site visits, snags and progress on assigned projects',
  'Viewer': 'Read only',
  'Client': 'Their own project portal, nothing else',
};

const blank = (): TeamMember => ({
  id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  email: '',
  role: 'Designer' as UserRole,
  status: 'Pending',
  title: '',
});

interface Props {
  team: TeamMember[];
  onChange: (team: TeamMember[]) => void;
  /** Signed-in user's email, so the row for "you" is not offered a delete button. */
  currentEmail?: string;
  tenantId: string;
  canEdit: boolean;
  /**
   * Emails on the team as last saved. The server creates a login only for
   * someone on the saved list, so the button waits for the row to be saved.
   */
  savedEmails?: string[];
}

const StudioTeamSection: React.FC<Props> = ({ team, onChange, currentEmail, tenantId, canEdit, savedEmails = [] }) => {
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  /*
    Logins for staff are made here, on the server, rather than in the Firebase
    console. An account made in the console has an unverified email, and the
    sign-in check will not trust an unverified address -- anyone can register
    one -- so those people would be turned away. See createStaffLogin.
  */
  const [issuingFor, setIssuingFor] = useState<string | null>(null);
  const [issued, setIssued] = useState<(StaffLogin & { name: string }) | null>(null);
  const [loginError, setLoginError] = useState<{ id: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  /* A Designer's projects (services/projectTeam), counted for their row and
     changed through the shared Assign projects window. */
  const directory = useProjectDirectory();
  const { designersOn, canAssign: canAssignProjects } = useProjectTeam();
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const projectCountFor = (email: string) => {
    const e = email.trim().toLowerCase();
    return directory.filter((p) => designersOn(p).includes(e)).length;
  };

  const issueLogin = async (m: TeamMember) => {
    setIssuingFor(m.id);
    setLoginError(null);
    try {
      const login = await createStaffLogin(tenantId, m.email.trim());
      update(m.id, { uid: login.uid, loginIssuedAt: new Date().toISOString() });
      setCopied(false);
      setIssued({ ...login, name: m.name || login.email });
    } catch (e: any) {
      setLoginError({ id: m.id, message: e?.message || 'Could not create the login. Please try again.' });
    } finally {
      setIssuingFor(null);
    }
  };

  const update = (id: string, patch: Partial<TeamMember>) =>
    onChange(team.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const add = () => onChange([...team, blank()]);

  const remove = (id: string) => {
    onChange(team.filter((m) => m.id !== id));
    setConfirmRemove(null);
  };

  /**
   * Fill the roster from the accounts that already exist.
   *
   * Reading the users collection needs platform-admin rights — firestore.rules
   * lets an ordinary user read only their own record — so this is offered to
   * everyone and explains itself when it is refused, rather than being hidden
   * behind a role check that would be wrong for the next person.
   */
  const importFromAccounts = async () => {
    setImporting(true);
    setImportNote(null);
    try {
      if (!db) throw new Error('Not connected');
      const snap = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId)));
      const existing = new Set(team.map((m) => (m.email || '').toLowerCase()));
      const found: TeamMember[] = [];

      let clientsSkipped = 0;

      snap.docs.forEach((d) => {
        const u = d.data() as any;
        const email = String(u.email || '').toLowerCase();
        if (!email || existing.has(email)) return;
        /*
          Clients hold accounts on this tenant too, but the roster answers "who
          works here" — it fills the site supervisor picker and titles the
          designer on outgoing mail. A client landing in it would be offered as
          staff on their own project.
        */
        if (u.role === 'Client') { clientsSkipped++; return; }
        found.push({
          id: `tm-${d.id}`,
          uid: d.id,
          name: u.displayName || email.split('@')[0],
          email,
          role: (u.role || 'Designer') as UserRole,
          status: 'Active',
          title: '',
        });
      });

      const skipNote = clientsSkipped
        ? ` ${clientsSkipped} client account${clientsSkipped === 1 ? '' : 's'} skipped.`
        : '';

      if (!found.length) {
        setImportNote((snap.size === 0
          ? 'No accounts found for this studio.'
          : `No new staff accounts to add.`) + skipNote);
      } else {
        onChange([...team, ...found]);
        setImportNote(`Added ${found.length} — check each role before saving.${skipNote}`);
      }
    } catch (e: any) {
      setImportNote(e?.code === 'permission-denied'
        ? 'Reading the account list needs platform admin rights. Add people by hand below.'
        : `Could not read accounts: ${e?.code || e?.message || 'unknown'}`);
    } finally {
      setImporting(false);
    }
  };

  const supervisors = team.filter((m) => m.role === ('Site Supervisor' as UserRole)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">
          The roster decides what each person sees when they sign in, who can be assigned to a site
          visit, and how the designer is titled on client emails.
        </p>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={importFromAccounts}
              disabled={importing}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {importing ? 'Reading…' : 'Import from accounts'}
            </button>
            <button
              onClick={add}
              className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white font-bold text-xs hover:bg-[#334486] flex items-center gap-2 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add person
            </button>
          </div>
        )}
      </div>

      {importNote && (
        <p className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">{importNote}</p>
      )}

      {team.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center hud-panel-in">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="font-bold text-slate-700">No one on the roster yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Until someone is listed here the Site Supervisor picker on a project stays empty and
            client emails are signed "Architect".
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {team.map((m, i) => {
            const isYou = !!currentEmail && m.email.toLowerCase() === currentEmail.toLowerCase();
            const incomplete = !m.name.trim() || !m.email.trim();
            return (
              <div
                key={m.id}
                className={`rounded-2xl border p-4 hud-row-in ${incomplete ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
                style={{ animationDelay: `${Math.min(i, 12) * 26}ms` }}
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Name</label>
                    <input
                      value={m.name}
                      disabled={!canEdit}
                      onChange={(e) => update(m.id, { name: e.target.value })}
                      placeholder="Full name"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] outline-none disabled:bg-slate-50"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Email</label>
                    <input
                      value={m.email}
                      disabled={!canEdit}
                      onChange={(e) => update(m.id, { email: e.target.value })}
                      placeholder="name@studio.in"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] outline-none disabled:bg-slate-50"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Access</label>
                    <select
                      value={m.role as string}
                      disabled={!canEdit}
                      onChange={(e) => update(m.id, { role: e.target.value as UserRole })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] outline-none disabled:bg-slate-50"
                    >
                      {ROLES.map((r) => <option key={r as string} value={r as string}>{r as string}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Title on documents
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={m.title || ''}
                        disabled={!canEdit}
                        onChange={(e) => update(m.id, { title: e.target.value })}
                        placeholder="Principal Architect"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] outline-none disabled:bg-slate-50"
                      />
                      {canEdit && !isYou && (
                        confirmRemove === m.id ? (
                          <button
                            onClick={() => remove(m.id)}
                            className="shrink-0 px-3 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700"
                          >
                            Sure?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(m.id)}
                            title="Remove from roster"
                            className="shrink-0 px-3 rounded-lg border border-slate-300 text-slate-400 hover:text-rose-600 hover:border-rose-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px]">
                  <span className="text-slate-500">{ROLE_BLURB[m.role as string] || ''}</span>
                  {isYou && <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold">You</span>}
                  {m.loginIssuedAt
                    ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                        Login created {new Date(m.loginIssuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    : m.uid
                      ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Has an account</span>
                      : <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">Not signed in yet</span>}
                  {incomplete && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Needs a name and email
                    </span>
                  )}
                  {/* A2 in the header mockups: a Designer's projects, set from their own row. */}
                  {m.role === ('Designer' as UserRole) && !incomplete && savedEmails.includes(m.email.trim().toLowerCase()) && (
                    <span className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${projectCountFor(m.email) ? 'bg-[#DCEBE6] text-[#1F4D45]' : 'bg-slate-100 text-slate-500'}`}>
                        {projectCountFor(m.email) ? `${projectCountFor(m.email)} project${projectCountFor(m.email) === 1 ? '' : 's'}` : 'No projects yet'}
                      </span>
                      {canAssignProjects && (
                        <button
                          type="button"
                          onClick={() => setAssigningFor(m.email.trim().toLowerCase())}
                          className="px-2.5 py-1 rounded-lg border border-[#1F4D45]/30 text-[#1F4D45] font-extrabold hover:bg-[#F1F7F5]"
                        >
                          Assign projects
                        </button>
                      )}
                    </span>
                  )}
                  {canEdit && !isYou && !incomplete && (
                    <span className="ml-auto">
                      {!savedEmails.includes(m.email.trim().toLowerCase()) ? (
                        <button
                          type="button"
                          disabled
                          title="Save the team first. A login can only be made for someone on the saved team."
                          className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-500 font-extrabold cursor-not-allowed"
                        >
                          Save first, then create login
                        </button>
                      ) : m.uid || m.loginIssuedAt ? (
                        <button
                          type="button"
                          onClick={() => issueLogin(m)}
                          disabled={issuingFor === m.id}
                          className="px-1 py-1 text-[#3D52A0] font-extrabold hover:underline disabled:opacity-50"
                        >
                          {issuingFor === m.id ? 'Resetting…' : 'Reset password'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => issueLogin(m)}
                          disabled={issuingFor === m.id}
                          className="px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white font-extrabold hover:bg-[#334486] disabled:opacity-50"
                        >
                          {issuingFor === m.id ? 'Creating…' : 'Create login'}
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {loginError?.id === m.id && (
                  <p className="mt-2 text-[11.5px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {loginError.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {team.length > 0 && supervisors === 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Nobody has the Site Supervisor role, so the supervisor picker on a project will still be empty.
        </p>
      )}

      {assigningFor && (
        <AssignProjectsModal designerEmail={assigningFor} onClose={() => setAssigningFor(null)} />
      )}

      {/* The same card client logins use: shown once, never retrievable. A
          plain CSS entrance rather than a framer exit, which inside a settings
          tab would hold up App's mode="wait" tab transition. */}
      {issued && (
        <div
          className="fixed inset-0 z-[200] bg-[#12182F]/50 backdrop-blur-sm flex items-center justify-center p-4 hud-panel-in"
          onClick={() => setIssued(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl border border-[#E2E5F0] shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <h4 className="font-extrabold text-[#12182F] text-[15px]">
                  {issued.reissued ? 'New password for' : 'Login for'} {issued.name}
                </h4>
                <p className="text-[13px] text-[#5A628A] font-medium mt-1 leading-relaxed">
                  Send these to them. They will be asked to choose their own password when they first sign in.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E2E5F0] divide-y divide-[#EDEFF7] overflow-hidden">
                <div className="px-3.5 py-2.5 bg-[#F6F7FB]">
                  <p className="text-[10px] uppercase font-black tracking-wider text-[#8E96B8]">Email</p>
                  <p className="text-[13px] font-bold text-[#252C4E] mt-0.5 break-all">{issued.email}</p>
                </div>
                <div className="px-3.5 py-2.5">
                  <p className="text-[10px] uppercase font-black tracking-wider text-[#8E96B8]">Temporary password</p>
                  <p className="text-[15px] font-black text-[#12182F] mt-0.5 tabular-nums select-all">{issued.tempPassword}</p>
                </div>
                <div className="px-3.5 py-2.5">
                  <p className="text-[10px] uppercase font-black tracking-wider text-[#8E96B8]">Access</p>
                  <p className="text-[13px] font-bold text-[#252C4E] mt-0.5">{issued.role}</p>
                </div>
              </div>

              <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
                This password is shown once and can't be looked up later. Copy it now, then save the team.
              </p>
              <p className="text-[11.5px] text-[#3A416B] bg-[#E8ECFB] rounded-xl px-3 py-2 font-medium">
                If they use Google with this same email, they can choose "Continue with Google" instead.
              </p>
            </div>

            <div className="bg-[#F6F7FB] px-5 py-3.5 border-t border-[#E2E5F0] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIssued(null)}
                className="px-4 py-2 bg-white hover:bg-[#EDEFF7] border border-[#E2E5F0] rounded-xl text-xs font-bold text-[#3A416B] transition"
              >
                Done
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(`Email: ${issued.email}\nTemporary password: ${issued.tempPassword}`);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-[#3D52A0] hover:bg-[#334486] transition"
              >
                {copied ? 'Copied' : 'Copy both'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioTeamSection;
