import React, { useEffect, useMemo, useState } from "react";
import { Download, Plus, Users } from '@/lib/lucide-shim';
import type { FullProjectData } from "../types";
import { useOrg } from "../contexts/OrgContext";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Button, EmptyState, Panel, Segmented } from "./ui/kit";
import { hasRole } from "../lib/roles";
import { holdsFinanceRole } from "../lib/roleAccess";
import { groupClients } from "../lib/clientGroups";
import { clientMoneyOf, withoutAmounts, type ClientMoney } from "../lib/clientMoney";
import { buildRows, filterRows, matchesSearch, sortRows, type ClientFilter, type SeenMarks } from "../lib/clientList";
import { loadStudioFollowUps } from "../services/opsDeskService";
import type { FollowUp } from "../lib/opsDesk";
import ClientList from "./clients/ClientList";
import ClientThreadPane from "./clients/ClientThreadPane";
import ClientCard from "./clients/ClientCard";
import ClientDossier from "./clients/ClientDossier";
import { SideDrawer } from "./clients/parts";

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

export default function ClientsDirectory({ projects, onOpenProject, onCreateNew }: ClientsDirectoryProps) {
  const { orgData, currentRole, currentRoles, currentUserAuth } = useOrg() as any;
  const roles = currentRoles?.length ? currentRoles : currentRole;
  const amountsHidden = !holdsFinanceRole(roles);
  const canPortal = hasRole(roles, CLIENT_LOGIN_ROLES);
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
  const rows = useMemo(() => buildRows(clients, moneyByProject, followUps, { amountsHidden, now }), [clients, moneyByProject, followUps, amountsHidden, now]);

  const scoped = useMemo(() => rows.filter((r) => kind === 'all' || (kind === 'dummy' ? r.client.isDummy : !r.client.isDummy)), [rows, kind]);
  const shown = useMemo(
    () => sortRows(filterRows(scoped.filter((r) => matchesSearch(r, query)), filter, marks), marks),
    [scoped, query, filter, marks],
  );
  const current = (selected && scoped.find((r) => r.client.clientKey === selected)) || null;

  /* On a wide screen a client is always open: the first in the list until one is picked. */
  useEffect(() => {
    if (wide && !current && shown[0]) setSelected(shown[0].client.clientKey);
  }, [wide, current, shown]);
  useEffect(() => { if (!current) setDossierOpen(false); }, [current]);

  const select = (key: string) => {
    setSelected(key);
    setThreadOpen(true);
    const next: SeenMarks = { ...marks, seen: { ...marks.seen, [key]: Date.now() } };
    setMarks(next);
    try { localStorage.setItem(seenKey(uid), JSON.stringify(next)); } catch { /* kept for this visit only */ }
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
        <Button variant="primary" icon={Plus} onClick={onCreateNew}>New client</Button>
      </div>
    ),
  }, [kind, clients, amountsHidden, onCreateNew]);

  const author = currentUserAuth?.displayName || currentUserAuth?.email?.split('@')[0] || currentRole || 'Studio Team';
  const emptyText = scoped.length === 0
    ? (kind === 'dummy' ? 'No dummy clients. Practice projects tagged Dummy show here.' : 'Clients appear here from their projects. Start one with New client.')
    : 'Nothing matches. Try All, or another search.';

  const card = current && (
    <ClientCard row={current} tenantId={tenantId} canPortal={canPortal} onOpenProject={onOpenProject}
      onOpenDossier={() => setDossierOpen(true)} />
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
                  onBack={() => setThreadOpen(false)} onDetails={() => setCardOpen(true)} />
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
        <ClientDossier client={current.client} author={author} onClose={() => setDossierOpen(false)} onOpenProject={(p) => onOpenProject(p)} />
      )}
    </div>
  );
}
