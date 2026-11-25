import React, { useEffect, useMemo, useState } from "react";
import { Download, Plus, Users } from '@/lib/lucide-shim';
import type { FullProjectData } from "../types";
import { useOrg } from "../contexts/OrgContext";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Button, EmptyState, Panel, Segmented } from "./ui/kit";
import { hasRole, primaryRole } from "../lib/roles";
import { holdsFinanceRole } from "../lib/roleAccess";
import { groupClients } from "../lib/clientGroups";
import { clientMoneyOf, withoutAmounts, type ClientMoney } from "../lib/clientMoney";
import { buildRows, filterRows, matchesSearch, sortRows, type ClientFilter, type SeenMarks } from "../lib/clientList";
import { loadStudioFollowUps, logFollowUp, logFollowUpOnce } from "../services/opsDeskService";
import type { FollowUpLine } from "../lib/clientCompose";
import { loadRecentVisits, watchClientVisits } from "../services/portalVisitsService";
import { bestLine, portalStatus, portalStatusForViewer, sessionsSince, type PortalLine, type PortalVisit } from "../lib/portalVisits";
import { nextMove } from "../lib/clientNextMove";
import { loadClientRecords } from "../services/clientThreadService";
import type { ThreadRecords } from "../lib/clientThread";
import type { FollowUp } from "../lib/opsDesk";
import ClientList from "./clients/ClientList";
import ClientThreadPane from "./clients/ClientThreadPane";
import ClientCard from "./clients/ClientCard";
import ClientDossier from "./clients/ClientDossier";
import { SideDrawer } from "./clients/parts";
import EditClientModal from "./clients/EditClientModal";
import { formOf, keyAfter, mergesWith, patchFor, type ClientForm } from "../lib/clientEdit";

/*
  CLIENTS: CONVERSATIONS (DESIGN.md "Clients: conversations", approved by the
  owner on 25 Nov 2026; handoff: Claude outputs/HANDOFF-clients-overhaul.md).

  Each client is one account (lib/clientGroups), shown in one Panel of three
  panes: the list, the client's thread, and the client card. Below 1024px the
  card is a drawer behind Details; below 768px the list is the screen and a
  client opens full width with a back arrow.

  No studio-level numbers (owner, 25 Nov 2026): no header figures, no counters,
  no counts on the filters. The only figures are one client's own Money, for
  the roles that see the studio's money (Owner, Admin, Ops Director, Super
  Admin). For everyone else the amounts are taken out as the money is loaded
  (lib/clientMoney withoutAmounts), so they never reach the screen.
*/

interface ClientsDirectoryProps {
  projects: FullProjectData[];
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  onCreateNew: () => void;
  /** New client: a lead with these details filled in, or a practice project for a dummy client (App.tsx). */
  onCreateClient?: (client: { name: string; phone: string; email: string; where: string; dummy?: boolean }) => void;
  /** Edit client: one project's new details, saved; "open" for the project open in the workspace (App.tsx). */
  onUpdateClientProject?: (projectId: string, patch: Record<string, any>) => Promise<'saved' | 'open'>;
}

type ProjectKindFilter = 'all' | 'actual' | 'dummy';

/* The roles the client-login callables accept (functions/src/index.ts CLIENT_LOGIN_ROLES). */
const CLIENT_LOGIN_ROLES = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* When this person last opened each client, so New activity means new to them. Kept in this browser (v1). */
const seenKey = (uid?: string | null) => `ffds_clients_seen:${uid || 'anon'}`;
function readMarks(uid?: string | null): SeenMarks {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(uid)) || 'null');
    if (raw && typeof raw.since === 'number' && raw.seen && typeof raw.seen === 'object') return raw;
  } catch { /* a fresh start below */ }
  const fresh: SeenMarks = { since: Date.now(), seen: {} };
  try { localStorage.setItem(seenKey(uid), JSON.stringify(fresh)); } catch { /* kept for this visit only */ }
  return fresh;
}

function useWide(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, [query]);
  return on;
}

export default function ClientsDirectory({ projects, onOpenProject, onCreateNew, onCreateClient, onUpdateClientProject }: ClientsDirectoryProps) {
  const { orgData, currentRole, currentRoles, currentUserAuth } = useOrg() as any;
  const roles = currentRoles?.length ? currentRoles : currentRole;
  const amountsHidden = !holdsFinanceRole(roles);
  const canPortal = hasRole(roles, CLIENT_LOGIN_ROLES);
  /* The follow-up log takes every studio role but Viewer (firestore.rules mayWriteOps). */
  const canLog = primaryRole(roles) !== 'Viewer';
  /* Editing a client changes their portal username, so it is for the same roles as portal access (Phase 0, Q3). */
  const canEdit = canPortal && !!onUpdateClientProject;
  /* Portal visits are not for a Viewer (owner, 25 Nov 2026): their screen never reads them, and the rules refuse it anyway. */
  const seesVisits = primaryRole(roles) !== 'Viewer';
  const tenantId: string = orgData?.tenantId || '';
  const uid: string | undefined = currentUserAuth?.uid;

  /* Opens on the real book. Sample projects are something you ask for. */
  const [kind, setKind] = useState<ProjectKindFilter>('actual');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  /* Below 768px: the thread is open over the list. */
  const [threadOpen, setThreadOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [marks, setMarks] = useState<SeenMarks>(() => readMarks(uid));
  useEffect(() => { setMarks(readMarks(uid)); }, [uid]);
  const wide = useWide('(min-width: 768px)');

  /* The follow-up log for every client, in one query (never one per row). */
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  useEffect(() => {
    let live = true;
    loadStudioFollowUps(tenantId)
      .then((f) => { if (live) setFollowUps(f); })
      .catch((e) => console.warn('Clients: follow-ups', e?.code || e));
    return () => { live = false; };
  }, [tenantId]);

  const now = useMemo(() => Date.now(), [projects, followUps]);
  const clients = useMemo(() => groupClients(projects, { amounts: !amountsHidden, now }), [projects, amountsHidden, now]);
  const moneyByProject = useMemo(() => {
    const out: Record<string, ClientMoney | null> = {};
    for (const p of projects) {
      const m = clientMoneyOf(p);
      out[p.id] = amountsHidden ? withoutAmounts(m) : m;
    }
    return out;
  }, [projects, amountsHidden]);
  /*
    Portal visits for the list: the studio's visits of the last day, in one
    query, on load and every 2 minutes while the screen is on view. No
    listener for the list; the opened client has its own (below).
  */
  const [recentVisits, setRecentVisits] = useState<PortalVisit[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!seesVisits || !tenantId) { setRecentVisits([]); return; }
    let live = true;
    const read = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadRecentVisits(tenantId, Date.now() - 24 * 3600000)
        .then((v) => { if (live) { setRecentVisits(v); setClock(Date.now()); } })
        .catch((e) => console.warn('Clients: portal visits', e?.code || e));
    };
    read();
    const t = window.setInterval(read, 2 * 60000);
    const back = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', back);
    return () => { live = false; window.clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [seesVisits, tenantId]);

  const rows = useMemo(
    () => buildRows(clients, moneyByProject, followUps, { amountsHidden, now: Math.max(now, clock), visits: recentVisits }),
    [clients, moneyByProject, followUps, amountsHidden, now, clock, recentVisits],
  );

  const scoped = useMemo(() => rows.filter((r) => kind === 'all' || (kind === 'dummy' ? r.client.isDummy : !r.client.isDummy)), [rows, kind]);
  const shown = useMemo(
    () => sortRows(filterRows(scoped.filter((r) => matchesSearch(r, query)), filter, marks), marks),
    [scoped, query, filter, marks],
  );
  /* The opened clients' records for their threads (loaded below), kept for the visit. */
  const [records, setRecords] = useState<Record<string, ThreadRecords>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const pickedRow = (selected && scoped.find((r) => r.client.clientKey === selected)) || null;

  /* The opened client's visits, live, so "on the portal now" follows them. */
  const [liveVisits, setLiveVisits] = useState<PortalVisit[] | null>(null);
  const pickedProjects = pickedRow ? pickedRow.client.projects.map((p) => p.id).join(',') : '';
  useEffect(() => {
    setLiveVisits(null);
    if (!seesVisits || !pickedProjects) return;
    return watchClientVisits(pickedProjects.split(','), (v) => { setLiveVisits(v); setClock(Date.now()); });
  }, [seesVisits, pickedProjects]);
  /* "On now" lapses 2 minutes after the last ping, so the opened client's line is read again each half minute. */
  useEffect(() => {
    if (!pickedRow) return;
    const t = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, [pickedRow?.client.clientKey]);

  /* Each project's portal line (lib/portalVisits portalStatus), the client's best, and Next move with the portal opens since our last message. */
  const portalLines = useMemo<Array<{ projectId: string; name: string; line: PortalLine }>>(() => {
    if (!pickedRow) return [];
    const at = Math.max(now, clock);
    return pickedRow.client.projects.map((p) => ({
      projectId: p.id,
      name: p.context?.name || 'Untitled project',
      line: seesVisits ? portalStatus(p, (liveVisits || []).filter((v) => v.projectId === p.id), at) : portalStatusForViewer(p),
    }));
  }, [pickedRow, liveVisits, seesVisits, now, clock]);
  const current = useMemo(() => {
    if (!pickedRow) return null;
    if (!seesVisits || !liveVisits?.length) return pickedRow;
    const sent = (records[pickedRow.client.clientKey]?.followUps || followUps)
      .filter((f) => f.outcome === 'reminded' && pickedRow.client.projects.some((p) => p.id === f.projectId))
      .reduce((m, f) => Math.max(m, f.at), 0);
    const opens = sent ? sessionsSince(liveVisits, sent) : 0;
    return {
      ...pickedRow,
      nextMove: nextMove({ bucket: pickedRow.client.bucket, milestones: pickedRow.money.milestones, quietDays: pickedRow.quietDays, portalOpensSinceLastMessage: opens, now: Math.max(now, clock) }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedRow, liveVisits, seesVisits, followUps, now, clock]);

  /* On a wide screen a client is always open: the first in the list until one is picked. */
  useEffect(() => {
    if (wide && !current && shown[0]) setSelected(shown[0].client.clientKey);
  }, [wide, current, shown]);
  useEffect(() => { if (!current) setDossierOpen(false); }, [current]);

  /*
    The opened client's records, for their thread: one batch when they are
    opened (services/clientThreadService), kept for this visit so going back
    to a client costs nothing. Leads are read only by those who may.
  */
  const currentKey = current?.client.clientKey || null;
  const mayReadLeads = canPortal;
  useEffect(() => {
    if (!current || records[current.client.clientKey]) return;
    const key = current.client.clientKey;
    let live = true;
    setLoadingKey(key);
    loadClientRecords(tenantId, current.client.projects.map((p) => ({ id: p.id, name: p.context?.name || '', leadId: (p.context as any)?.leadId || null })), { leads: mayReadLeads })
      .then((r) => { if (live) setRecords((prev) => ({ ...prev, [key]: r })); })
      .catch((e) => { console.warn('Clients: thread', e?.code || e); if (live) setRecords((prev) => ({ ...prev, [key]: { followUps: [], visits: [], moms: [], meetings: [], leadCreatedAt: {} } })); })
      .finally(() => { if (live) setLoadingKey((k) => (k === key ? null : k)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, tenantId]);

  const select = (key: string) => {
    setSelected(key);
    setThreadOpen(true);
    const next: SeenMarks = { ...marks, seen: { ...marks.seen, [key]: Date.now() } };
    setMarks(next);
    try { localStorage.setItem(seenKey(uid), JSON.stringify(next)); } catch { /* kept for this visit only */ }
  };

  /*
    One line to a project's follow-up log (lib/clientCompose), in this
    person's name. It joins the opened client's thread and the list's preview
    at once, and is on the Ops Desk too: the same collection. A moved note
    carries its own id and is written only once.
  */
  const writeLine = async (projectId: string, line: FollowUpLine & { id?: string; at?: number }): Promise<FollowUp | null> => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('That project is not loaded.');
    const me = { email: String(currentUserAuth?.email || ''), name: currentUserAuth?.displayName || currentUserAuth?.email || 'Studio' };
    const base = {
      tenantId: (project as any).tenantId || tenantId, projectId, projectName: project.context?.name || 'Untitled project',
      me, channel: line.channel, outcome: line.outcome, note: line.note, subject: line.subject, next: null,
    };
    const f = line.id
      ? await logFollowUpOnce({ ...base, id: line.id, at: line.at }).then((r) => (r.written ? r.line : null))
      : await logFollowUp({ ...base, at: line.at });
    if (f) {
      const key = clients.find((c) => c.projects.some((p) => p.id === projectId))?.clientKey;
      if (key) {
        setRecords((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], followUps: [f, ...prev[key].followUps] } } : prev));
        /* What you log yourself is not news to you: the client counts as seen up to it. */
        setMarks((prev) => {
          const next: SeenMarks = { ...prev, seen: { ...prev.seen, [key]: Math.max(prev.seen[key] || 0, f.at, Date.now()) } };
          try { localStorage.setItem(seenKey(uid), JSON.stringify(next)); } catch { /* kept for this visit only */ }
          return next;
        });
      }
      setFollowUps((prev) => [f, ...prev]);
    }
    return f;
  };

  /* Today's export, unchanged: every account, whichever side of the switch, with the value only where values are shown. */
  const handleExportCSV = () => {
    if (clients.length === 0) return;
    const headers = [
      "Client Name", "Email", "Phone", "Location", "Type", "Lifecycle Bucket", "Total Projects", "Project Names",
      "Configurations", "VIP Status", "Multi-Project", "Active Site", "Days Idle", "Last Activity",
      ...(!amountsHidden ? ["Total Portfolio Value (INR)"] : []),
    ];
    const csvRows = clients.map((c) => [
      `"${c.clientName.replace(/"/g, '""')}"`,
      `"${c.clientEmail}"`,
      `"${c.clientPhone}"`,
      `"${c.clientLocation}"`,
      c.isDummy ? "Dummy / Sample" : "Actual",
      `"${c.bucket}"`,
      c.projects.length,
      `"${c.projects.map((p) => p.context?.name || 'Untitled').join('; ')}"`,
      `"${c.configs.join('; ')}"`,
      c.isVip ? "Yes" : "No",
      c.isMultiProject ? "Yes" : "No",
      c.hasActiveSite ? "Yes" : "No",
      c.daysIdle,
      `"${new Date(c.lastActivity).toLocaleDateString()}"`,
      ...(!amountsHidden ? [c.totalValue ?? 0] : []),
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `clients_directory_${tenantId || 'studio'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* The title row: the Actual / Dummy switch, Export CSV and + New client. No figures. */
  usePageHeader({
    actions: (
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<ProjectKindFilter> label="Actual or dummy clients" size="sm" value={kind} onChange={setKind}
          options={[{ id: 'actual', label: 'Actual' }, { id: 'dummy', label: 'Dummy' }, { id: 'all', label: 'All' }]} />
        <Button icon={Download} onClick={handleExportCSV} title="Export the client list as a CSV file">Export CSV</Button>
        <Button variant="primary" icon={Plus} onClick={() => (canEdit && onCreateClient ? openNew() : onCreateNew())}>New client</Button>
      </div>
    ),
  }, [kind, clients, amountsHidden, onCreateNew, canEdit, onCreateClient]);

  const author = currentUserAuth?.displayName || currentUserAuth?.email?.split('@')[0] || currentRole || 'Studio Team';
  const emptyText = scoped.length === 0
    ? (kind === 'dummy' ? 'No dummy clients. Practice projects tagged Dummy show here.' : 'Clients appear here from their projects. Start one with New client.')
    : 'Nothing matches. Try All, or another search.';

  /*
    Edit client / New client (lib/clientEdit, EditClientModal). Edit writes to
    every project of the client and says how it went: "Saved to n projects",
    or a rose note naming each project that was not saved, with Retry. The
    screen follows the client to their new key, merged where another client
    already had it.
  */
  const [editing, setEditing] = useState<{ mode: 'edit' | 'new'; initial: ClientForm } | null>(null);
  const [toast, setToast] = useState<{ tone: 'good' | 'bad'; text: string; retry?: () => void } | null>(null);
  useEffect(() => {
    if (!toast || toast.tone === 'bad') return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);
  const openEdit = () => { if (canEdit && current) setEditing({ mode: 'edit', initial: formOf(current.client, current.primary) }); };
  const openNew = () => setEditing({
    mode: 'new',
    initial: { name: '', phone: '', email: '', home: '', place: '', config: '', dummy: kind === 'dummy', people: [] },
  });

  const writeEdit = async (targets: FullProjectData[], f: ClientForm, primaryId: string, merged: string | null, total: number) => {
    if (!onUpdateClientProject) return;
    const results = await Promise.allSettled(targets.map((p) => onUpdateClientProject(p.id, patchFor(p.context, f, p.id === primaryId))));
    const failed = targets.filter((_, i) => results[i].status === 'rejected');
    setSelected(keyAfter(f));
    if (failed.length) {
      setToast({
        tone: 'bad',
        text: `Not saved: ${failed.map((p) => p.context?.name || 'Untitled project').join(', ')}. ${total - failed.length ? `Saved to the other ${total - failed.length}.` : ''}`,
        retry: () => { setToast(null); void writeEdit(failed, f, primaryId, merged, total); },
      });
    } else {
      setToast({ tone: 'good', text: `Saved to ${total} project${total === 1 ? '' : 's'}${merged ? `. Merged with ${merged}` : ''}.` });
    }
  };
  const saveForm = async (f: ClientForm) => {
    if (!editing) return;
    if (editing.mode === 'new') {
      setEditing(null);
      onCreateClient?.({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), where: f.place.trim(), dummy: f.dummy });
      return;
    }
    if (!current) return;
    const merged = mergesWith(clients, current.client.clientKey, f)?.clientName || null;
    const targets = current.client.projects;
    setEditing(null);
    await writeEdit(targets, f, current.primary.id, merged, targets.length);
  };

  const card = current && (
    <ClientCard row={current} tenantId={tenantId} canPortal={canPortal} onOpenProject={onOpenProject} portalLines={portalLines}
      onOpenDossier={() => setDossierOpen(true)} onEdit={canEdit ? openEdit : undefined} />
  );

  return (
    <div className="px-4 pb-10">
      <Panel flush>
        <div className="grid h-[calc(100dvh-12rem)] min-h-[560px] grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <div className={cx('min-h-0 h-full md:border-r md:border-slate-100', threadOpen && 'hidden md:block')}>
            <ClientList rows={shown} selected={current?.client.clientKey || null} onSelect={select} query={query} onQuery={setQuery}
              filter={filter} onFilter={setFilter} marks={marks} amountsHidden={amountsHidden} now={now} emptyText={emptyText} />
          </div>

          <div className={cx('min-h-0 h-full', !threadOpen && 'hidden md:block')}>
            {current ? (
              <div key={current.client.clientKey} className="hud-swap h-full">
                <ClientThreadPane row={current} now={now} studioName={orgData?.orgName || 'our studio'} onOpenProject={onOpenProject}
                  money={moneyByProject} records={records[current.client.clientKey] || null} loading={loadingKey === current.client.clientKey}
                  canLog={canLog} onLog={async (pid, line) => { await writeLine(pid, line); }}
                  portalVisits={seesVisits ? liveVisits || [] : []} portalLine={bestLine(portalLines.map((x) => x.line))}
                  onBack={() => setThreadOpen(false)} onDetails={() => setCardOpen(true)} onEdit={canEdit ? openEdit : undefined} />
              </div>
            ) : (
              <div className="p-6">
                <EmptyState icon={Users} title="Pick a client" text="Their projects, their details and the message to send next open here." />
              </div>
            )}
          </div>

          <div className="hidden lg:block min-h-0 h-full overflow-y-auto border-l border-slate-100">
            {current && <div key={current.client.clientKey} className="hud-swap">{card}</div>}
          </div>
        </div>
      </Panel>

      {cardOpen && current && (
        <SideDrawer label="Client details" onClose={() => setCardOpen(false)} width="max-w-[360px]">{card}</SideDrawer>
      )}
      {dossierOpen && current && (
        <ClientDossier client={current.client} author={author} onClose={() => setDossierOpen(false)} onOpenProject={(p) => onOpenProject(p)}
          canLog={canLog} projectId={current.primary.id} onMove={(line) => writeLine(current.primary.id, line)} />
      )}
      {editing && (
        <EditClientModal mode={editing.mode} initial={editing.initial} onClose={() => setEditing(null)} onSave={saveForm}
          projectCount={current?.client.projects.length || 1} primaryName={current?.primary.context?.name}
          mergeName={(f) => (current ? mergesWith(clients, current.client.clientKey, f)?.clientName || null : null)} />
      )}
      {toast && (
        <div role={toast.tone === 'bad' ? 'alert' : 'status'}
          className={cx('phd-pop fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm z-[320] rounded-2xl border shadow-xl px-4 py-3 flex items-start gap-3 bg-white',
            toast.tone === 'bad' ? 'border-rose-200' : 'border-emerald-200')}>
          <p className={cx('text-sm font-semibold flex-1', toast.tone === 'bad' ? 'text-rose-700' : 'text-emerald-700')}>{toast.text}</p>
          {toast.retry && <Button size="sm" variant="danger" onClick={toast.retry}>Retry</Button>}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600 text-sm font-bold px-1">×</button>
        </div>
      )}
    </div>
  );
}
