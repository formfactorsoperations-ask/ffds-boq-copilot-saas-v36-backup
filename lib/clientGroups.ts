/*
  WHO THE STUDIO'S CLIENTS ARE: projects grouped into client accounts.

  Moved here from components/ClientsDirectory.tsx unchanged, so the Clients
  screen and Home (components/home/useStudioHomeData.ts) count the same people.
  Home used to copy the grouping key "exactly"; it imports it now.

  Two projects are the same account only when the email AND the name agree.
  Keying on `clientEmail || clientName` let one address override every name
  behind it: four different people whose projects all carried the studio's own
  inbox collapsed into a single card titled with whichever name happened to load
  first. A genuine repeat client still merges; a shared inbox no longer erases
  who the client is.

  Pure, so the tests run it.
*/
import type { FullProjectData } from "../types";
import { classifyProject } from "./projectClassification";
import { getSingleProjectValue } from "./financialsUtils";

export type ClientBucket = 'pipeline' | 'active' | 'delivered' | 'lost';

export interface AggregatedClient {
  clientKey: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientLocation: string;
  projects: FullProjectData[];
  /** Null where amounts are hidden ({ amounts: false }): the figure never reaches the screen. */
  totalValue: number | null;
  lastActivity: number;
  daysIdle: number;
  bucket: ClientBucket;
  isVip: boolean;
  isMultiProject: boolean;
  hasActiveSite: boolean;
  hasPendingInvoices: boolean;
  isRecent: boolean;
  needsFollowup: boolean;
  isDummy: boolean;
  configs: string[];
}

const norm = (v?: string | null) => (v || '').toLowerCase().trim();

/** The account a project belongs to: its client's email and name, both lower-cased and trimmed. */
export const clientKeyOf = (email?: string | null, name?: string | null): string => `${norm(email)}|${norm(name)}`;

export const STATUS_TO_BUCKET: Record<string, ClientBucket> = {
  lead: 'pipeline',
  draft: 'pipeline',
  proposal_sent: 'pipeline',
  negotiation: 'pipeline',
  won: 'active',
  execution: 'active',
  work_paused: 'active',
  completed: 'delivered',
  lost: 'lost',
  archived: 'lost',
};

const BUCKET_PRIORITY: Record<ClientBucket, number> = {
  active: 4,
  pipeline: 3,
  delivered: 2,
  lost: 1,
};

/*
  Classification comes from lib/projectClassification, which reads the
  project's TAG and nothing else. A client counts as dummy only when EVERY
  project of theirs is tagged test, so an untagged project keeps its client in
  the real directory, which is the safe direction to be wrong in.
*/
const isDummyProject = (p: FullProjectData) => classifyProject(p) === 'test';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/**
 * Every client account, from the projects. `amounts: false` leaves the account
 * value out (null) for a role that does not see the studio's money.
 */
export function groupClients(projects: FullProjectData[], opts: { amounts?: boolean; now?: number } = {}): AggregatedClient[] {
  const amounts = opts.amounts !== false;
  const now = opts.now ?? Date.now();
  const clientsMap = new Map<string, {
    clientKey: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientLocation: string;
    projects: FullProjectData[];
    totalValue: number;
    lastActivity: number;
    configs: Set<string>;
    hasPendingInvoices: boolean;
    hasActiveSite: boolean;
  }>();

  for (const p of projects) {
    const clientEmail = p.context?.clientEmail;
    const clientName = p.context?.clientName;

    // Skip projects without client information
    if (!clientEmail && !clientName) continue;

    const groupKey = clientKeyOf(clientEmail, clientName);
    const projectValue = amounts ? getSingleProjectValue(p) : 0;
    const projectStatus = p.context?.status || 'draft';
    const projectConfig = p.context?.config;

    const hasPendingInvoice = p.context?.paymentMilestones?.some(
      (m) => m.status === 'invoiced' || m.status === 'pending'
    ) || false;

    const isSiteActive = projectStatus === 'execution' || projectStatus === 'work_paused';

    const existing = clientsMap.get(groupKey);
    if (existing) {
      existing.projects.push(p);
      existing.totalValue += projectValue;
      if ((p.lastModified || 0) > existing.lastActivity) {
        existing.lastActivity = p.lastModified || 0;
      }
      if (!existing.clientName && clientName) existing.clientName = clientName;
      if (!existing.clientEmail && clientEmail) existing.clientEmail = clientEmail;
      if (!existing.clientPhone && p.context?.clientPhone) existing.clientPhone = p.context?.clientPhone;
      if (!existing.clientLocation && p.context?.location) existing.clientLocation = p.context?.location;
      if (projectConfig) existing.configs.add(projectConfig);
      if (hasPendingInvoice) existing.hasPendingInvoices = true;
      if (isSiteActive) existing.hasActiveSite = true;
    } else {
      const configsSet = new Set<string>();
      if (projectConfig) configsSet.add(projectConfig);

      clientsMap.set(groupKey, {
        clientKey: groupKey,
        clientName: clientName || "Unknown Client",
        clientEmail: clientEmail || "",
        clientPhone: p.context?.clientPhone || "",
        clientLocation: p.context?.location || "",
        projects: [p],
        totalValue: projectValue,
        lastActivity: p.lastModified || now,
        configs: configsSet,
        hasPendingInvoices: hasPendingInvoice,
        hasActiveSite: isSiteActive,
      });
    }
  }

  return Array.from(clientsMap.values()).map((client) => {
    let maxPriority = 0;
    let finalBucket: ClientBucket = 'lost';
    let dummyCount = 0;

    for (const proj of client.projects) {
      if (isDummyProject(proj)) dummyCount++;
      const status = proj.context?.status || 'draft';
      const bucket = STATUS_TO_BUCKET[status] || 'pipeline';
      const priority = BUCKET_PRIORITY[bucket] || 0;
      if (priority > maxPriority) {
        maxPriority = priority;
        finalBucket = bucket;
      }
    }

    const daysIdle = Math.max(0, Math.floor((now - client.lastActivity) / ONE_DAY_MS));
    return {
      clientKey: client.clientKey,
      clientName: client.clientName,
      clientEmail: client.clientEmail,
      clientPhone: client.clientPhone,
      clientLocation: client.clientLocation,
      projects: client.projects,
      totalValue: amounts ? client.totalValue : null,
      lastActivity: client.lastActivity,
      daysIdle,
      bucket: finalBucket,
      isVip: amounts && client.totalValue >= 2500000, // >= ₹25L
      isMultiProject: client.projects.length > 1,
      hasActiveSite: client.hasActiveSite,
      hasPendingInvoices: client.hasPendingInvoices,
      isRecent: (now - client.lastActivity) <= ONE_WEEK_MS,
      needsFollowup: (finalBucket === 'pipeline' || finalBucket === 'active') && daysIdle >= 14,
      isDummy: dummyCount === client.projects.length,
      configs: Array.from(client.configs),
    };
  });
}
