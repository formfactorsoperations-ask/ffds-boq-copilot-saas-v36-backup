/*
  The platform admin console.

  What this replaced counted two collections in the browser and printed a
  hardcoded "99.9%" for platform health beside them. It could not answer any
  question worth asking of a platform: which studios have gone quiet, which
  projects are about to hit Firestore's document limit, whether a tenant's
  records still point at things that exist. It also could not have shown the
  outage we had the same week — thirteen subcollections denied by missing
  security rules — because nothing in it ever tested access.

  Cross-tenant reads happen in Cloud Functions, because no browser client is
  allowed to read every tenant and none should be. The permission probe is the
  deliberate exception: the question there is what *this signed-in user* can
  reach, which a server cannot answer on their behalf.

  Everything degrades on its own. If the functions are not deployed the
  console says so and falls back to what the browser can legitimately read,
  rather than showing a spinner for ever — which is exactly the failure this
  screen now exists to catch.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { db, auth, functions } from '../../services/firebaseClient';
import { collection, getDocs, doc, setDoc, updateDoc, query, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { del } from 'idb-keyval';
import { BuildingOfficeIcon, UserIcon, ShieldCheckIcon } from '../Icons';
import { useOrg } from '../../contexts/OrgContext';
import { runPermissionProbe, summariseProbe, PROBE_PATHS, ProbeResult } from '../../lib/platformProbe';
import { CountUp, Gauge, Dot } from '../ui/HudBits';

/*
  Telling "not deployed" from "deployed and unhappy".

  A callable that does not exist does not reliably answer `functions/not-found`:
  the SDK reports `functions/internal` for it too, which is the same code a
  deployed function returns when it throws. Neither can be distinguished from
  the outside with certainty, so the message names both possibilities rather
  than asserting one — and always shows the raw code, because guessing wrong
  in either direction sends someone looking in the wrong place.
*/
const looksUndeployed = (e: any): boolean => {
  const code = String(e?.code || '');
  return code === 'functions/not-found'
      || code === 'functions/internal'
      || /not-found|404/i.test(String(e?.message || ''));
};

type TabId = 'overview' | 'studios' | 'users' | 'health' | 'data';

const TABS: { id: TabId; label: string; blurb: string }[] = [
  { id: 'overview', label: 'Overview', blurb: 'Platform totals and what needs attention' },
  { id: 'studios', label: 'Studios', blurb: 'Tenants, usage and dormancy' },
  { id: 'users', label: 'Users', blurb: 'Access and role assignment' },
  { id: 'health', label: 'Health', blurb: 'Can the app read what it needs?' },
  { id: 'data', label: 'Data', blurb: 'Integrity sweep and document size watch' },
];

const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const Card: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' }> =
  ({ label, value, note, tone }) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-black ${
        tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-800'
      }`}>{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {note && <div className="text-xs font-medium text-slate-500 mt-2">{note}</div>}
    </div>
  );

const Severity: React.FC<{ level: string }> = ({ level }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
    level === 'high' ? 'bg-rose-100 text-rose-700'
    : level === 'medium' ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600'
  }`}>{level}</span>
);

export default function PlatformAdminConsole() {
  const { orgData, updateOrgData, currentUserAuth } = useOrg();
  const isAuthorized = currentUserAuth?.email === 'formfactors.operations@gmail.com';

  const [tab, setTab] = useState<TabId>('overview');

  // Server-side read models
  const [overview, setOverview] = useState<any>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const [sweep, setSweep] = useState<any>(null);
  const [sweepErr, setSweepErr] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [repair, setRepair] = useState<any>(null);
  const [repairErr, setRepairErr] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  // Applying rewrites live project documents, so it asks first.
  const [confirmRepair, setConfirmRepair] = useState(false);

  // Client-side probe
  const [probe, setProbe] = useState<ProbeResult[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeProgress, setProbeProgress] = useState({ done: 0, total: 0 });

  // Fallback reads, used when the functions are not deployed yet
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Studio creation
  const [form, setForm] = useState({ name: '', adminEmail: '', tier: 'Professional', contact: '', phone: '', city: '' });
  const [creating, setCreating] = useState(false);

  // User editing
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editRole, setEditRole] = useState('');
  const [editTenant, setEditTenant] = useState('');

  const [studioFilter, setStudioFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  /* The browser can always read these two; they are what the console falls
     back to so the screen is never empty just because a function is missing. */
  const loadDirect = useCallback(async () => {
    if (!db) return;
    try {
      const [o, u] = await Promise.all([
        getDocs(collection(db, 'organizations')),
        getDocs(collection(db, 'users')),
      ]);
      setOrganizations(o.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsers(u.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      console.error('Direct admin read failed', e);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewErr(null);
    try {
      if (!functions) throw new Error('Functions not configured');
      const call = httpsCallable(functions, 'platformOverview');
      const res: any = await call({});
      setOverview(res.data);
    } catch (e: any) {
      // Not deployed, not permitted, or offline — say which, and carry on.
      setOverviewErr(looksUndeployed(e) ? `not-deployed:${e?.code || 'unknown'}` : (e?.code || e?.message || 'unknown'));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    loadDirect();
    loadOverview();
  }, [isAuthorized, loadDirect, loadOverview]);

  /**
   * Preview or perform the document shrink.
   *
   * The same call either way — `apply` is the only difference — so what the
   * preview reports is what the run does, rather than an estimate of it.
   */
  const runRepair = async (apply: boolean) => {
    setRepairing(true);
    setRepairErr(null);
    setConfirmRepair(false);
    try {
      if (!functions) throw new Error('Functions not configured');
      const call = httpsCallable(functions, 'platformRepairDocuments');
      const res: any = await call({ apply });
      setRepair(res.data);
      if (apply) loadOverview();   // the size figures upstairs are now stale
    } catch (e: any) {
      setRepairErr(looksUndeployed(e) ? `not-deployed:${e?.code || 'unknown'}` : (e?.code || e?.message || 'unknown'));
    } finally {
      setRepairing(false);
    }
  };

  const runSweep = async () => {
    setSweeping(true);
    setSweepErr(null);
    try {
      if (!functions) throw new Error('Functions not configured');
      const call = httpsCallable(functions, 'platformIntegritySweep');
      const res: any = await call({});
      setSweep(res.data);
    } catch (e: any) {
      setSweepErr(looksUndeployed(e) ? `not-deployed:${e?.code || 'unknown'}` : (e?.code || e?.message || 'unknown'));
    } finally {
      setSweeping(false);
    }
  };

  const runProbe = async () => {
    setProbing(true);
    setProbe([]);            // clear, so the sweep visibly starts from nothing
    setProbeProgress({ done: 0, total: 0 });
    try {
      // Probe against a real project so the subcollection paths are meaningful.
      let projectId: string | null = null;
      if (db) {
        try {
          const snap = await getDocs(query(collection(db, 'projects'), limit(1)));
          projectId = snap.docs[0]?.id || null;
        } catch { /* the probe will report the projects denial itself */ }
      }
      await runPermissionProbe(
        { db, collection: collection as any, getDocs: getDocs as any, limitTo: (ref, n) => query(ref, limit(n)) },
        projectId,
        (result, done, total) => {
          // Append as each path answers rather than waiting for the whole sweep.
          setProbe(prev => [...(prev || []), result]);
          setProbeProgress({ done, total });
        },
      );
    } finally {
      setProbing(false);
    }
  };

  const handleCreateStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !db) return;
    setCreating(true);
    try {
      const tenantId = 'tenant_' + Math.random().toString(36).slice(2, 11);
      await setDoc(doc(db, 'organizations', tenantId), {
        tenantId,
        orgName: form.name,
        adminEmail: form.adminEmail,
        tierPlan: form.tier,
        contactPerson: form.contact,
        phone: form.phone,
        city: form.city,
        createdAt: new Date().toISOString(),
      });
      setForm({ name: '', adminEmail: '', tier: 'Professional', contact: '', phone: '', city: '' });
      await Promise.all([loadDirect(), loadOverview()]);
    } catch (err) {
      console.error('Error creating studio', err);
      alert('Could not create the studio. See the console for details.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || !db) return;
    try {
      await updateDoc(doc(db, 'users', selectedUser.id), { role: editRole, tenantId: editTenant });
      setSelectedUser(null);
      await Promise.all([loadDirect(), loadOverview()]);
    } catch (err) {
      console.error('Error updating user', err);
      alert('Could not update the user. See the console for details.');
    }
  };

  const handleSwitchToStudio = async (tenantId: string, orgName: string) => {
    if (!db || !auth?.currentUser) return;
    if (!window.confirm(`Switch your workspace to ${orgName}? The page will reload.`)) return;
    try {
      updateOrgData({ ...orgData, tenantId, orgName });
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { tenantId });
      // Local caches belong to the previous workspace.
      localStorage.removeItem('ffds_project_library');
      await del('ffds_project_library');
      ['ffds_item_bank', 'ffds_draft_bank', 'ffds_templates'].forEach(k => localStorage.removeItem(k));
      window.location.reload();
    } catch (err) {
      console.error('Error switching studio', err);
      alert('Could not switch workspace.');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-10">
        <div className="text-center max-w-sm">
          <ShieldCheckIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Unauthorized</h2>
          <p className="text-slate-500 text-sm">This console is limited to the platform owner account.</p>
        </div>
      </div>
    );
  }

  const tenants: any[] = overview?.tenants || organizations.map((o: any) => ({
    tenantId: o.tenantId || o.id, orgName: o.orgName, tierPlan: o.tierPlan,
    projects: null, seats: null, dormant: false, lastActivity: null, storageKB: null,
  }));

  const notDeployed = !!overviewErr && overviewErr.startsWith('not-deployed');
  const busy = loadingOverview || probing || sweeping || creating;

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto">
      <header className="px-6 sm:px-10 pt-7 pb-0 border-b border-slate-200 hud-glass">
        <div className="flex items-center gap-3 text-[#0066CC]">
          <ShieldCheckIcon className="w-7 h-7" />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Platform Admin</h1>
          {/* Live only when something is genuinely in flight. A status light
              that is always on tells you nothing. */}
          <span className="ml-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <Dot tone={busy ? 'warn' : (overviewErr ? 'bad' : 'ok')} live={busy} />
            {busy ? 'Working' : overviewErr ? 'Degraded' : 'Nominal'}
          </span>
        </div>
        <div className="hud-rule h-px bg-gradient-to-r from-[#0066CC]/50 to-transparent mt-3" />
        <p className="text-slate-500 text-sm mt-2 mb-4">
          Tenants, access, and the health of the platform underneath them.
        </p>
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.blurb}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-[#0066CC] text-[#0066CC]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >{t.label}</button>
          ))}
        </nav>
      </header>

      <div className="p-6 sm:p-10 space-y-6">

        {notDeployed && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <span className="font-bold block mb-1">Platform read-models are not answering</span>
            The cross-tenant figures come from two Cloud Functions. The call returned{' '}
            <code className="px-1 rounded bg-amber-100">{overviewErr?.split(':')[1]}</code>, which
            means either they have not been deployed or they are deployed and failing — the SDK
            reports both the same way. Everything below falls back to what this browser can read
            directly, so studio and user management still work; only the aggregates are missing.
            <code className="block mt-2 px-2 py-1 rounded bg-amber-100 text-[12px] w-fit">
              firebase deploy --only functions:platformOverview,functions:platformIntegritySweep
            </code>
          </div>
        )}
        {overviewErr && !notDeployed && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900">
            <span className="font-bold block mb-1">Could not load platform figures</span>
            {overviewErr}
          </div>
        )}

        {/* ---------------------------------------------------------- OVERVIEW */}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 hud-panel-in">
              <Card label="Studios" value={overview?.totals.organizations ?? organizations.length}
                    note={`${tenants.filter(t => t.dormant).length} dormant`} />
              <Card label="Users" value={overview?.totals.users ?? users.length}
                    note="Across all tenants" />
              <Card label="Projects" value={overview?.totals.projects ?? '—'}
                    note={overview ? `${overview.totals.compressedProjects} compressed` : 'Needs read-models'} />
              <Card
                label="Near document limit"
                value={overview?.documentWatch.atRiskCount ?? '—'}
                tone={overview?.documentWatch.atRiskCount ? 'bad' : 'ok'}
                note={overview
                  ? `Warn at ${overview.documentWatch.warnAtPct}% of ${overview.documentWatch.limitKB} KB`
                  : 'Needs read-models'}
              />
            </div>

            {overview?.documentWatch.atRisk?.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-800">Projects approaching the document limit</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Firestore refuses a document over {overview.documentWatch.limitKB} KB. A project that crosses it
                    cannot be saved at all — and the save path drops images to try to stay under, quietly.
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                    <tr><th className="text-left p-3">Project</th><th className="text-left p-3">Tenant</th>
                        <th className="text-right p-3">Size</th><th className="text-right p-3">Of limit</th>
                        <th className="text-left p-3 pl-5">Compressed</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.documentWatch.atRisk.map((p: any) => (
                      <tr key={p.id}>
                        <td className="p-3 font-medium text-slate-800">{p.name}</td>
                        <td className="p-3 font-mono text-xs text-slate-500">{p.tenantId}</td>
                        <td className="p-3 text-right font-mono">{p.kb} KB</td>
                        <td className={`p-3 text-right font-mono font-bold ${
                          p.pctOfLimit >= 85 ? 'text-rose-600' : p.pctOfLimit >= 70 ? 'text-amber-600' : 'text-slate-600'
                        }`}>{p.pctOfLimit}%</td>
                        <td className="p-3 pl-5 text-slate-500">{p.compressed ? 'yes' : 'no'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {overview?.orphanTenants?.length > 0 && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900">
                <span className="font-bold block mb-1">Projects belong to tenants with no organization record</span>
                {overview.orphanTenants.join(', ')} — these projects are invisible to every studio.
              </div>
            )}
          </>
        )}

        {/* ----------------------------------------------------------- STUDIOS */}
        {tab === 'studios' && (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <input
                value={studioFilter}
                onChange={e => setStudioFilter(e.target.value)}
                placeholder="Filter studios…"
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
              />
              <span className="text-xs text-slate-500">{tenants.length} studios</span>
            </div>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-3">Studio</th><th className="text-left p-3">Plan</th>
                    <th className="text-right p-3">Projects</th><th className="text-right p-3">Seats</th>
                    <th className="text-right p-3">Storage</th><th className="text-left p-3 pl-5">Last activity</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenants
                    .filter(t => !studioFilter || `${t.orgName} ${t.tenantId}`.toLowerCase().includes(studioFilter.toLowerCase()))
                    .map(t => (
                      <tr key={t.tenantId} className={t.dormant ? 'bg-amber-50/40' : ''}>
                        <td className="p-3">
                          <span className="font-medium text-slate-800 block">{t.orgName}</span>
                          <span className="font-mono text-[11px] text-slate-400">{t.tenantId}</span>
                        </td>
                        <td className="p-3 text-slate-600">{t.tierPlan || '—'}</td>
                        <td className="p-3 text-right font-mono">{t.projects ?? '—'}</td>
                        <td className="p-3 text-right font-mono">{t.seats ?? '—'}</td>
                        <td className="p-3 text-right font-mono">{t.storageKB != null ? `${t.storageKB} KB` : '—'}</td>
                        <td className="p-3 pl-5 text-slate-600">
                          {fmtDate(t.lastActivity)}
                          {t.dormant && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">
                              {t.projects === 0 ? 'no projects' : 'dormant'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button onClick={() => handleSwitchToStudio(t.tenantId, t.orgName)}
                                  className="text-[#0066CC] font-medium hover:text-[#0055B3] text-sm">
                            Switch to
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                <BuildingOfficeIcon className="w-5 h-5 text-slate-400" /> Onboard a studio
              </h2>
              <form onSubmit={handleCreateStudio} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {([
                  ['name', 'Studio name *'], ['adminEmail', 'Admin email'], ['contact', 'Contact person'],
                  ['phone', 'Phone'], ['city', 'City'],
                ] as const).map(([k, label]) => (
                  <input key={k} value={(form as any)[k]} placeholder={label}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0066CC]" />
                ))}
                <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0066CC]">
                  {['Starter', 'Professional', 'Enterprise'].map(p => <option key={p}>{p}</option>)}
                </select>
                <button type="submit" disabled={creating || !form.name.trim()}
                  className="md:col-span-3 justify-self-start px-5 py-2.5 rounded-xl bg-[#0066CC] text-white font-bold text-sm hover:bg-[#0055B3] disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create studio'}
                </button>
              </form>
            </section>
          </>
        )}

        {/* ------------------------------------------------------------- USERS */}
        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <input value={userFilter} onChange={e => setUserFilter(e.target.value)}
                placeholder="Filter by email, role or tenant…"
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-80 focus:outline-none focus:ring-2 focus:ring-[#0066CC]" />
              <span className="text-xs text-slate-500">{users.length} users</span>
            </div>
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                  <tr><th className="text-left p-3">Email</th><th className="text-left p-3">Tenant</th>
                      <th className="text-left p-3">Role</th><th className="text-right p-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users
                    .filter(u => !userFilter || `${u.email} ${u.role} ${u.tenantId}`.toLowerCase().includes(userFilter.toLowerCase()))
                    .map(u => {
                      const orphan = u.tenantId && !tenants.some(t => t.tenantId === u.tenantId);
                      return (
                        <tr key={u.id} className={orphan ? 'bg-rose-50/50' : ''}>
                          <td className="p-3 font-medium text-slate-800">{u.email}</td>
                          <td className="p-3 font-mono text-xs">
                            {u.tenantId || <span className="text-rose-600 font-sans font-bold">none</span>}
                            {orphan && <span className="ml-2 text-[10px] font-bold uppercase text-rose-600">unknown tenant</span>}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              u.role === 'Super Admin' ? 'bg-purple-100 text-purple-700'
                              : u.role === 'Admin' ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'}`}>{u.role || 'Admin'}</span>
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => { setSelectedUser(u); setEditRole(u.role || 'Admin'); setEditTenant(u.tenantId || 'demo-tenant-01'); }}
                              className="text-[#0066CC] font-medium hover:text-[#0055B3] text-sm">Edit access</button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </section>
          </>
        )}

        {/* ------------------------------------------------------------ HEALTH */}
        {tab === 'health' && (
          <>
            <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in ${probing ? 'hud-scanning' : ''}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="max-w-2xl">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    Permission probe
                    {probing && <Dot tone="warn" live />}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Reads one document from every collection the app uses and reports what came back.
                    Firestore rules do not cascade into subcollections, so a collection can be denied
                    while its parent is readable — and the app's listeners show that as a screen that
                    never finishes loading rather than as an error.
                  </p>
                </div>
                <button onClick={runProbe} disabled={probing}
                  className="px-5 py-2.5 rounded-xl bg-[#0066CC] text-white font-bold text-sm hover:bg-[#0055B3] disabled:opacity-50 whitespace-nowrap">
                  {probing
                    ? `Probing ${probeProgress.done}/${probeProgress.total || PROBE_PATHS.length}…`
                    : 'Run probe'}
                </button>
              </div>

              {probe && (() => {
                const s = summariseProbe(probe);
                return (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center mt-5">
                      <div className="rounded-2xl border p-5 hud-well">
                        <Gauge
                          pct={s.total ? (s.ok / Math.max(1, s.total - s.skipped)) * 100 : 0}
                          label="Reachable"
                          sub={`${s.ok} of ${Math.max(0, s.total - s.skipped)} collections`}
                          tone={s.denied ? 'bad' : s.errored ? 'warn' : 'ok'}
                        />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card label="Readable" value={s.ok} />
                        <Card label="Denied" value={s.denied} tone={s.denied ? 'bad' : 'ok'} />
                        <Card label="Errored" value={s.errored} tone={s.errored ? 'warn' : 'ok'} />
                        <Card label="Skipped" value={s.skipped} />
                      </div>
                    </div>
                    <table className="w-full text-sm mt-5">
                      <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                        <tr><th className="text-left p-3">Feature</th><th className="text-left p-3">Path</th>
                            <th className="text-left p-3">Result</th><th className="text-right p-3">Time</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {probe.map((r, i) => (
                          <tr
                            key={r.path}
                            className={`hud-row-in ${r.status === 'denied' ? 'bg-rose-50/50' : ''}`}
                            style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                          >
                            <td className="p-3 font-medium text-slate-800">{r.label}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">{r.path}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                r.status === 'ok' ? 'bg-emerald-100 text-emerald-700'
                                : r.status === 'denied' ? 'bg-rose-100 text-rose-700'
                                : r.status === 'error' ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                              {r.detail && <span className="ml-2 text-xs text-slate-500">{r.detail}</span>}
                              {r.status === 'ok' && <span className="ml-2 text-xs text-slate-400">{r.docs} docs</span>}
                            </td>
                            <td className="p-3 text-right font-mono text-xs text-slate-400">{r.ms} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </section>
          </>
        )}

        {/* -------------------------------------------------------------- DATA */}
        {tab === 'data' && (
          <>
            <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in ${repairing ? 'hud-scanning' : ''}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="max-w-2xl">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    Document size repair
                    {repairing && <Dot tone="warn" live />}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Rewrites the projects closest to the {overview?.documentWatch.limitKB ?? 1024} KB limit:
                    moves floor plans and logos into Storage, replaces the settings blob stored under
                    a field named <code className="bg-slate-100 px-1 rounded">settingsHash</code> with
                    an actual hash, and drops the full context copy each proposal version keeps.
                    Nothing is deleted — media moves and the document keeps the link.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => runRepair(false)} disabled={repairing}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">
                    {repairing ? 'Working…' : 'Preview'}
                  </button>
                  {repair && !repair.apply && repair.reclaimedKB > 0 && (
                    <button onClick={() => setConfirmRepair(true)} disabled={repairing}
                      className="px-5 py-2.5 rounded-xl bg-[#0066CC] text-white font-bold text-sm hover:bg-[#0055B3] disabled:opacity-50 whitespace-nowrap">
                      Apply
                    </button>
                  )}
                </div>
              </div>

              {confirmRepair && (
                <div className="mt-4 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-amber-900 font-semibold">
                    Rewrite {repair.results.filter((r: any) => r.actions?.length).length} project
                    {repair.results.filter((r: any) => r.actions?.length).length === 1 ? '' : 's'}?
                  </p>
                  <p className="text-amber-800 mt-1">
                    This edits live project documents. Media is copied to Storage before the document
                    is changed, so nothing is lost — but the previous document contents are replaced.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => runRepair(true)}
                      className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold text-xs hover:bg-amber-700">
                      Yes, repair them
                    </button>
                    <button onClick={() => setConfirmRepair(false)}
                      className="px-4 py-2 rounded-lg border border-amber-300 text-amber-800 font-bold text-xs hover:bg-amber-100">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {repairErr?.startsWith('not-deployed') && (
                <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  The repair runs in a Cloud Function that did not answer ({repairErr?.split(':')[1]}) —
                  most likely it has not been deployed yet.
                </p>
              )}
              {repairErr && !repairErr.startsWith('not-deployed') && (
                <p className="mt-4 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                  Repair failed: {repairErr}
                </p>
              )}

              {repair && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
                    <Card label="Examined" value={repair.examined} note={`of ${repair.totalProjects} projects`} />
                    <Card label="Would reclaim" value={repair.reclaimedKB} note="KB"
                          tone={repair.reclaimedKB ? 'ok' : undefined} />
                    <Card label={repair.apply ? 'Rewritten' : 'To rewrite'}
                          value={repair.results.filter((r: any) => r.actions?.length).length} note="projects" />
                  </div>

                  {repair.apply && (
                    <p className="mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                      Done — {repair.reclaimedKB} KB reclaimed across {repair.results.filter((r: any) => r.actions?.length).length} project(s).
                    </p>
                  )}

                  {repair.results.length === 0 ? (
                    <p className="mt-5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                      No project is close enough to the limit to need repairing.
                    </p>
                  ) : (
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <th className="py-2 pr-3">Project</th>
                            <th className="py-2 pr-3 text-right">Before</th>
                            <th className="py-2 pr-3 text-right">After</th>
                            <th className="py-2">What changes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {repair.results.map((r: any, i: number) => (
                            <tr key={r.id} className="hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}>
                              <td className="py-2.5 pr-3 font-semibold text-slate-800">{r.name}</td>
                              <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{r.beforeKB} KB</td>
                              <td className={`py-2.5 pr-3 text-right tabular-nums font-bold ${
                                r.afterKB != null && r.afterKB < r.beforeKB ? 'text-emerald-700' : 'text-slate-400'
                              }`}>
                                {r.afterKB != null ? `${r.afterKB} KB` : '—'}
                              </td>
                              <td className="py-2.5 text-slate-600 text-xs">
                                {r.error
                                  ? <span className="text-rose-700">{r.error}</span>
                                  : (r.actions?.length ? r.actions.join(' · ') : 'nothing to do')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in ${sweeping ? 'hud-scanning' : ''}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="max-w-2xl">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    Integrity sweep
                    {sweeping && <Dot tone="warn" live />}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Looks for records that point at things which no longer exist, or carry nothing:
                    projects with no tenant, users assigned to unknown studios, documents marked
                    compressed with no data. None of it stops the app today, which is why it goes
                    unnoticed until it does.
                  </p>
                </div>
                <button onClick={runSweep} disabled={sweeping}
                  className="px-5 py-2.5 rounded-xl bg-[#0066CC] text-white font-bold text-sm hover:bg-[#0055B3] disabled:opacity-50 whitespace-nowrap">
                  {sweeping ? 'Sweeping…' : 'Run sweep'}
                </button>
              </div>

              {sweepErr?.startsWith('not-deployed') && (
                <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  The sweep runs in a Cloud Function that did not answer ({sweepErr?.split(':')[1]}) —
                  most likely it has not been deployed yet.
                </p>
              )}
              {sweepErr && !sweepErr.startsWith('not-deployed') && (
                <p className="mt-4 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                  Sweep failed: {sweepErr}
                </p>
              )}

              {sweep && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                    <Card label="High" value={sweep.bySeverity.high || 0} tone={sweep.bySeverity.high ? 'bad' : 'ok'} />
                    <Card label="Medium" value={sweep.bySeverity.medium || 0} tone={sweep.bySeverity.medium ? 'warn' : 'ok'} />
                    <Card label="Low" value={sweep.bySeverity.low || 0} />
                    <Card label="Scanned" value={sweep.scanned.projects + sweep.scanned.users + sweep.scanned.organizations}
                          note="records" />
                  </div>
                  {sweep.findings.length === 0 ? (
                    <p className="mt-5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                      Nothing to report — every record points at something that exists.
                    </p>
                  ) : (
                    <ul className="mt-5 divide-y divide-slate-100 text-sm">
                      {sweep.findings.map((f: any, i: number) => (
                        <li key={i} className="py-2.5 flex items-start gap-3 hud-row-in"
                            style={{ animationDelay: `${Math.min(i, 15) * 24}ms` }}>
                          <Severity level={f.severity} />
                          <span className="text-slate-700">{f.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sweep.truncated && (
                    <p className="mt-3 text-xs text-slate-500">Showing the first 200 findings.</p>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {loadingOverview && tab === 'overview' && !overview && !overviewErr && (
          <p className="text-sm text-slate-400">Loading platform figures…</p>
        )}
      </div>

      {/* Edit user */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Edit user access</h3>
              <p className="text-sm text-slate-500">{selectedUser.email}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tenant</label>
                <select value={editTenant} onChange={e => setEditTenant(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0066CC]">
                  {tenants.map(t => <option key={t.tenantId} value={t.tenantId}>{t.orgName} — {t.tenantId}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0066CC]">
                  {['Super Admin', 'Admin', 'Designer', 'Viewer', 'Client'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setSelectedUser(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={handleUpdateUser}
                className="px-5 py-2 rounded-xl bg-[#0066CC] text-white text-sm font-bold hover:bg-[#0055B3]">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
