/**
 * What is waiting on the ops user, for this one project.
 *
 * The push to a client's portal only ever announced itself on the page that
 * already does the pushing. From anywhere else in the project there was no
 * sign at all, so a client sat 24 hours behind on two corrected figures and
 * nobody knew. Three completed jobs finished with 110 scope variations their
 * clients were never shown.
 *
 * Nothing here sends anything. Every alert routes to the screen that owns the
 * decision -- the Client Portal tab for anything the client would see -- so the
 * data is verified in place before a human presses Release. That deliberately
 * leaves the existing publish controls as the only thing that can reach a
 * client.
 */

import { pendingPublish } from './publishStatus';
import { computeSchedule } from './paymentSchedule';

export type AlertKind = 'portal' | 'client' | 'money';

export interface HubAlert {
  id: string;
  kind: AlertKind;
  /** The chip above the headline. */
  label: string;
  title: string;
  detail: string;
  /** Relative age, already worded. */
  when?: string;
  /** Route to open. Never an action that writes. */
  goTo: string;
  cta: string;
  /** Sorts to the top. */
  severity: 0 | 1 | 2;
}

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function ago(iso?: string | number | null): string {
  if (!iso) return '';
  const t = typeof iso === 'number' ? iso : Date.parse(String(iso));
  if (!isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Every publishable item that went public after the client's copy was built.
 *
 * `clientVisibility.publishedAt` is stamped on the transition into published,
 * so anything stamped later than the projection is something the studio has
 * decided to show and has not yet sent.
 */
function publishedSinceRelease(context: any, builtAt: number): number {
  let n = 0;
  const walk = (arr: any[]) => (arr || []).forEach((i: any) => {
    const at = Date.parse(i?.clientVisibility?.publishedAt || '');
    if (isFinite(at) && at > builtAt) n++;
  });
  ['siteUpdates', 'projectUpdates', 'siteVisits', 'momHistory',
   'materialSelections', 'designDocuments', 'boqRevisions'].forEach(k => walk(context?.[k]));
  walk(context?.documents?.issues);
  return n;
}

export function buildHubAlerts(args: { context: any; view: any | null }): HubAlert[] {
  const ctx = args.context || {};
  const view = args.view;
  const vctx = view?.context || null;
  const out: HubAlert[] = [];
  const pend = pendingPublish(ctx);

  // ── has the client ever been sent anything ───────────────────────────
  if (!view && pend.published > 0) {
    out.push({
      id: 'never-sent', kind: 'portal', label: 'Client portal', severity: 0,
      title: 'Nothing has ever reached this client',
      detail: `${pend.published} item${pend.published === 1 ? ' is' : 's are'} published but their portal has never been built.`,
      goTo: 'client-portal', cta: 'Review in Client Portal',
    });
  }

  if (view) {
    const builtAt = Date.parse(view.builtAt || '') || 0;

    const since = publishedSinceRelease(ctx, builtAt);
    if (since > 0) {
      out.push({
        id: 'unsent', kind: 'portal', label: 'Client portal', severity: 0,
        title: `${since} published item${since === 1 ? '' : 's'} not sent yet`,
        detail: 'Published in the studio, but their portal still predates it.',
        when: `their copy was built ${ago(builtAt)}`,
        goTo: 'client-portal', cta: 'Review in Client Portal',
      });
    }

    /*
      Figures the client is reading that are no longer true.

      Compared only when the project carries approved values, because without
      them the schedule has no base here and a difference would be an artefact
      of this screen rather than anything real.
    */
    const f = ctx.financials || {};
    const comparable = typeof f.approvedExecutionValue === 'number'
      || typeof f.approvedDesignValue === 'number';
    const sent = vctx?.portalMoney;

    if (comparable && sent) {
      const now = computeSchedule({ context: ctx });
      const diffs: string[] = [];

      if (Math.abs((sent.projectValue || 0) - now.totals.grossProjectValue) > 1) {
        diffs.push(`contract total ${money(sent.projectValue)} → ${money(now.totals.grossProjectValue)}`);
      }
      (ctx.paymentMilestones || []).forEach((m: any) => {
        const was = sent.milestoneAmounts?.[m.id];
        const is = now.byId[m.id]?.owed;
        if (typeof was === 'number' && typeof is === 'number' && Math.abs(was - is) > 1) {
          diffs.push(`${m.name} ${money(was)} → ${money(is)}`);
        }
      });

      if (diffs.length) {
        out.push({
          id: 'money-drift', kind: 'portal', label: 'Client portal', severity: 0,
          title: diffs.length === 1
            ? 'A figure on their portal is out of date'
            : `${diffs.length} figures on their portal are out of date`,
          detail: diffs.slice(0, 2).join(' · ') + (diffs.length > 2 ? ` · and ${diffs.length - 2} more` : ''),
          when: `sent ${ago(builtAt)}`,
          goTo: 'client-portal', cta: 'Check it in Client Portal',
        });
      }
    }
  }

  // ── prepared but not published ───────────────────────────────────────
  if (pend.draft > 0) {
    const top = pend.byGroup[0];
    out.push({
      id: 'drafts', kind: 'portal', label: 'Not published', severity: 1,
      title: `${pend.draft} item${pend.draft === 1 ? '' : 's'} prepared, not published`,
      detail: top ? `Mostly ${top.label.toLowerCase()} (${top.draft}). The client cannot see any of it.` : '',
      goTo: 'client-portal', cta: 'Review item by item',
    });
  }

  // ── a client waiting on an answer ────────────────────────────────────
  (ctx.materialSelections || []).forEach((m: any) => {
    if (!m?.changeReason || m.studioReply) return;
    if (['locked', 'ordered'].includes(String(m.status))) return;
    out.push({
      id: 'ask-' + m.id, kind: 'client', label: 'From the client', severity: 0,
      title: `Your client asked about ${m.itemName || 'a finish'}`,
      detail: `“${String(m.changeReason).slice(0, 90)}” — still unanswered.`,
      when: ago(m.changeRequestedAt),
      goTo: 'materials', cta: 'Reply on SOF & Selections',
    });
  });

  // ── invoices raised and unpaid ───────────────────────────────────────
  const invoiced = (ctx.paymentMilestones || []).filter((m: any) => m.status === 'invoiced');
  if (invoiced.length) {
    out.push({
      id: 'invoiced', kind: 'money', label: 'Money', severity: 2,
      title: `${invoiced.length} invoice${invoiced.length === 1 ? '' : 's'} raised and unpaid`,
      detail: invoiced.map((m: any) => m.name).slice(0, 2).join(' · '),
      when: ago(invoiced[0]?.invoiceDate),
      goTo: 'payment-calc', cta: 'Open Money',
    });
  }

  return out.sort((a, b) => a.severity - b.severity);
}
