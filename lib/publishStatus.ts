import { ProjectContext } from '../types';
import { visibilityBreakdown } from './clientVisibility';

/**
 * WHAT IS WAITING TO BE PUBLISHED.
 *
 * The registry lived inside PortalPublishControls, so the only place that
 * could say "three things are sitting unpublished" was the panel a studio had
 * to open to find out. A re-issued Payment Schedule stayed in draft for days
 * because nothing outside that panel mentioned it — the client kept reading v1
 * while ops believed v2 had gone out.
 *
 * Extracted so any surface can ask the same question of the same data.
 */

/** The collections a client can be shown, and where they live on the context. */
export interface PublishableGroup {
  key: string;
  label: string;
  titleOf: (i: any) => string;
  dateOf: (i: any) => any;
  /** Non top-level collections supply their own accessors. */
  read?: (ctx: any) => any[];
  write?: (ctx: any, next: any[]) => any;
}

export const PUBLISHABLE: PublishableGroup[] = [
  { key: 'siteUpdates',       label: 'Site updates',    titleOf: i => i.title || i.note || i.caption || 'Site update', dateOf: i => i.date || i.createdAt },
  { key: 'projectUpdates',    label: 'Client updates',  titleOf: i => i.title || i.summary || 'Update',                dateOf: i => i.date || i.createdAt },
  { key: 'siteVisits',        label: 'Site visits',     titleOf: i => i.title || i.purpose || 'Site visit',            dateOf: i => i.date || i.visitDate },
  { key: 'momHistory',        label: 'Meeting notes',   titleOf: i => i.title || i.subject || 'Meeting note',          dateOf: i => i.date || i.meetingDate },
  { key: 'materialSelections',label: 'Material selections', titleOf: i => i.itemName || i.name || 'Selection',         dateOf: i => i.date || i.createdAt },
  { key: 'designDocuments',   label: 'Drawings & renders',  titleOf: i => i.name || i.title || 'Document',             dateOf: i => i.date || i.issuedAt },
  /*
    `boqRevisions` is NOT publishable, and was listed here as "Scope variations".

    It is the studio's own edit ledger -- `lib/boqVersions.ts` and
    `services/clientPortalEngine.ts` both already say so, the latter adding that
    "client-facing variations live on projectUpdates". Its rows carry `item`,
    `section`, `type`, `reasonCategory`, `note`, `oldValue`, `newValue` and
    nothing else, so the projection's mapping of `title`/`date`/`status`/
    `amount` resolved to undefined on every field: publishing one sent the
    client an empty row. The types alone give it away -- MARK_PENDING,
    APPROVE_PENDING, MARK_VENDOR are internal workflow states.

    Listing it here also meant 99 ledger entries across three FINISHED projects
    were counted as things the studio owed its clients, drowning the thirteen
    items that genuinely were waiting.

    The client still gets the "why" behind a change: `lib/clientBoq.ts` derives
    it by diffing the BOQ version they approved against the current one, which
    is deliberate -- the ledger is emptied when a revision is approved into a
    new version, so by the time a client could read it there is nothing left.
  */
  /*
    Released documents. They live at context.documents.issues rather than on a
    top-level array, hence the accessors.

    Releasing a document used to reach the client the instant it was clicked, so
    a re-issue silently replaced what they were reading — including a version
    they had already signed. A new issue is staged instead, and this is where it
    is published. Without this row a staged issue could never be released at
    all: invisible to the client by design, and invisible to ops by omission.
  */
  {
    key: 'documentIssues',
    label: 'Documents',
    titleOf: i => `${i.reference || i.kind}${i.version > 1 ? ` · v${i.version}` : ''}`,
    dateOf: i => i.issuedAt,
    read: ctx => (ctx?.documents?.issues || []).filter((i: any) => !i.addendumTo && !i.withdrawnAt),
    write: (ctx, next) => {
      const byId = new Map(next.map((i: any) => [i.id, i]));
      return {
        ...ctx,
        documents: {
          ...(ctx.documents || {}),
          issues: (ctx.documents?.issues || []).map((i: any) => byId.get(i.id) || i),
        },
      };
    },
  },
];


export interface PendingPublish {
  /** Everything a client could be shown, across every collection. */
  total: number;
  /** Sitting in draft — prepared, not yet visible to the client. */
  draft: number;
  published: number;
  hidden: number;
  /** Per-collection draft counts, largest first, empties dropped. */
  byGroup: { key: string; label: string; draft: number }[];
}

export function pendingPublish(context: ProjectContext | undefined): PendingPublish {
  const groups = PUBLISHABLE.map(g => ({
    key: g.key,
    label: g.label,
    items: (g.read ? g.read(context) : ((context as any)?.[g.key] || [])) as any[],
  })).filter(g => g.items.length > 0);

  const all = groups.flatMap(g => g.items);
  const totals = visibilityBreakdown(all);

  return {
    total: all.length,
    draft: totals.draft,
    published: totals.published,
    hidden: totals.hidden,
    byGroup: groups
      .map(g => ({ key: g.key, label: g.label, draft: visibilityBreakdown(g.items).draft }))
      .filter(g => g.draft > 0)
      .sort((a, b) => b.draft - a.draft),
  };
}
