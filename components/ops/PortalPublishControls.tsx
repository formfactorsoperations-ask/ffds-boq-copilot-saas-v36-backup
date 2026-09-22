import React, { useEffect, useMemo, useState } from 'react';
import { ProjectContext } from '../../types';
import { writePortalView, probePortalView } from '../../services/portalViewService';
import { collection, getDocs } from 'firebase/firestore';
import { db as fsDb } from '../../services/firebaseClient';
import { normaliseAddition, scopeAdditionsPath } from '../../lib/scopeAdditions';
import { PortalScopeAddition } from '../../lib/portalProjection';
import { ClientBoqRow } from '../../lib/clientBoq';
import { PortalMoney } from '../../lib/portalMoney';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { buildPortalView, portalViewSummary } from '../../lib/portalProjection';
import { PUBLISHABLE } from '../../lib/publishStatus';
import {
  ClientVisibilityState,
  isVisibleToClient,
  migrateVisibility,
  publish,
  hide,
  publishEverythingUpTo,
  visibilityBreakdown,
} from '../../lib/clientVisibility';

/**
 * Ops control over what the client sees.
 *
 * The portal used to publish by omission: anything ops created was visible
 * unless someone remembered one of five hide-flags. Visibility is now explicit
 * (lib/clientVisibility.ts) and this is where ops sets it.
 *
 * It sits above the portal preview rather than inside it, because ops needs to
 * see the state of things the client cannot see at all — a preview that simply
 * hides drafts cannot tell you the difference between "nothing published yet"
 * and "nothing exists".
 */

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  currentUser?: string;
  /** Needed to store the projection the client reads. */
  projectId?: string;
  /*
    The scope in client-safe form, built by lib/clientBoq in App where the tier
    and the item bank are in scope. Sent with the projection so a signed-in
    client sees the BOQ at all — without it their scope tab is empty, since they
    have neither tiers nor bank to derive it from.
  */
  clientBoq?: ClientBoqRow[];
  /** What those rows' markers were measured against, stored so they persist. */
  clientBoqBaseline?: ClientBoqRow[];
  /*
    The money, computed in App where the tier summary and the billing rules are
    in scope. Without it the client's payments tab has percentages and no base
    to apply them to, so a design ladder renders as a column of zeroes.
  */
  portalMoney?: PortalMoney;
}

const STATE_STYLE: Record<ClientVisibilityState | 'unmigrated', string> = {
  published: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  draft:     'text-slate-500 bg-slate-50 border-slate-200',
  hidden:    'text-amber-700 bg-amber-50 border-amber-200',
  unmigrated:'text-slate-400 bg-slate-50 border-slate-200',
};

export default function PortalPublishControls({ projectContext, setProjectContext, currentUser, projectId, clientBoq, clientBoqBaseline, portalMoney }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const { orgData } = useOrg();
  const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
  const [releasedAt, setReleasedAt] = useState<string | null>(null);
  /*
    Whether a projection exists at all, read from where the client reads it.

    This panel used to report only what *this* session had sent — "Not sent
    since you opened this" whether the client had a copy from last week or had
    never had one. That is the difference between a client seeing yesterday's
    portal and a client being told their project is not published yet, and ops
    could not tell the two apart from here.
  */
  const [everSent, setEverSent] = useState<boolean | null>(null);
  /** Whatever stopped the last send or check, verbatim. */
  const [sendError, setSendError] = useState<string | null>(null);
  /** What the client's stored copy actually contains, section by section. */
  const [sentSummary, setSentSummary] = useState<{ section: string; count: number }[] | null>(null);
  useEffect(() => {
    if (!projectId) { setEverSent(null); return; }
    let cancelled = false;
    probePortalView(projectId).then(({ view, error }) => {
      if (cancelled) return;
      setEverSent(!!view);
      setSendError(error || null);
      if (view?.builtAt) setReleasedAt(view.builtAt);
      setSentSummary(view ? portalViewSummary(view).filter(r => r.count > 0) : null);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  /*
    Publishing decides what *may* be shown; releasing is what actually sends it.
    They are separate because the client reads a stored projection, not this
    project — so until the projection is rewritten, a publish has changed
    nothing on their side. Ops should be able to see that difference.
  */
  /*
    Scope additions, reduced to what a client should see.

    Read at release time rather than held in state: this control already
    rebuilds the whole projection on every send precisely so the stored view
    cannot drift from what is true, and a stale additions list would reintroduce
    exactly that drift. Cost is one read per send.

    Cost, margin and the internal type code are deliberately dropped here -- the
    client gets what they asked for, what it costs them, and whether it is
    settled.
  */
  const gatherScopeAdditions = async (): Promise<PortalScopeAddition[] | undefined> => {
    const tenant = orgData?.tenantId;
    if (!fsDb || !tenant || !projectId) return undefined;
    try {
      const snap = await getDocs(collection(fsDb, scopeAdditionsPath(tenant, projectId)));
      const rows = snap.docs
        .map(d => normaliseAddition(d.id, d.data()))
        .filter(a => a.invoiceStatus !== 'cancelled' && a.invoiceStatus !== 'void' && a.invoiceStatus !== 'draft')
        .map<PortalScopeAddition>(a => ({
          ref: a.ref,
          request: a.clientRequest,
          nature: a.type === 'TYPE_A' ? 'Finish change' : a.type === 'TYPE_C' ? 'New scope' : 'Alteration',
          issuedAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
          designFeeTotal: a.designFeeTotal,
          designFeeBase: a.designFeeBase,
          designFeeGst: a.designFeeGst,
          executionSubtotal: a.executionSubtotal,
          executionGst: a.executionGst,
          executionTotal: a.executionTotal,
          grandTotal: a.grandTotal,
          released: a.workAuthorized,
          designFeePaid: a.designFeePaid,
          executionPaid: a.executionPaid,
          /* Description, quantity, unit and amount only -- never baseCost or
             marginOverride. */
          lines: (a.miniBoq || [])
            .map((l: any) => ({
              description: String(l?.description || 'Item'),
              qty: Number(l?.qty) || 0,
              unit: String(l?.unit || ''),
              amount: Number(l?.baseCost) || 0,
            }))
            .filter((l: any) => l.amount > 0 || l.qty > 0),
        }));
      return rows.length ? rows : undefined;
    } catch {
      /* A failed read must not silently publish "no additions". */
      return undefined;
    }
  };

  const release = async (ctx: ProjectContext) => {
    if (!projectId) return;
    setSendError(null);
    setReleasing(true);
    // The client cannot read studioSettings, so who to pay travels with the
    // projection instead.
    try {
      const view = await writePortalView(projectId, ctx, {
        name: (settings as any)?.companyName || orgData?.orgName,
        logoUrl: (settings as any)?.logoUrl || orgData?.orgLogo,
        phone: (settings as any)?.phone || orgData?.contactPhone,
        email: (settings as any)?.email || orgData?.contactEmail,
        address: (settings as any)?.address || orgData?.officeAddress,
        bankDetails: (settings as any)?.bankDetails || orgData?.bankDetails,
        cityState: orgData?.cityState,
        gstin: orgData?.gstin,
        legalName: orgData?.legalName,
        signatoryName: orgData?.signatoryName,
        signatoryTitle: orgData?.signatoryTitle,
      }, clientBoq, clientBoqBaseline, await gatherScopeAdditions(), portalMoney);
      if (view) {
        setReleasedAt(view.builtAt);
        setEverSent(true);
        setSentSummary(portalViewSummary(view).filter(r => r.count > 0));
      }
    } catch (e: any) {
      setSendError(e?.message || String(e));
    } finally {
      setReleasing(false);
    }
  };

  /*
    Send the current state of the project to the client's copy.

    Releasing was only ever a side effect of changing something: publishing a
    draft, or the bulk publish — which disables itself when there are no drafts.
    So a project whose items were all published before this projection existed,
    or one with nothing publishable on it yet, had no reachable path to writing
    the document the portal reads, and the client was told indefinitely that
    their project was not published. Publishing decides what may be shown;
    this is how it gets there, and it needs to stand on its own.
  */
  const sendNow = () => release(projectContext);

  /** What the client would receive if released right now. */
  const preview = useMemo(
    () => portalViewSummary(buildPortalView(projectId || 'preview', projectContext, undefined, clientBoq, undefined, undefined, portalMoney)).filter(r => r.count > 0),
    [projectContext, projectId, clientBoq, portalMoney]
  );

  const groups = useMemo(
    () =>
      PUBLISHABLE.map(g => ({
        ...g,
        items: (g.read ? g.read(projectContext) : ((projectContext as any)?.[g.key] || [])) as any[],
      }))
        .filter(g => g.items.length > 0),
    [projectContext]
  );

  const totals = useMemo(() => {
    const all = groups.flatMap(g => g.items);
    return { ...visibilityBreakdown(all), total: all.length };
  }, [groups]);

  /** Rewrite one collection, leaving every other field of the context alone. */
  const writeGroup = (key: string, next: any[]) => {
    const g = PUBLISHABLE.find(x => x.key === key);
    setProjectContext(prev =>
      g?.write ? g.write(prev as any, next) : ({ ...(prev as any), [key]: next }));
  };

  const readGroup = (key: string): any[] => {
    const g = PUBLISHABLE.find(x => x.key === key);
    return (g?.read ? g.read(projectContext) : ((projectContext as any)?.[key] || [])) as any[];
  };

  const setItemState = (key: string, index: number, state: ClientVisibilityState) => {
    const items = [...readGroup(key)];
    const current = items[index];
    if (!current) return;
    const prior = current.clientVisibility || migrateVisibility(current);
    items[index] = {
      ...current,
      clientVisibility:
        state === 'published' ? publish(currentUser)
        : state === 'hidden' ? hide('Withheld by studio', prior)
        : { state: 'draft' as const },
    };
    writeGroup(key, items);
    // Keep the client's copy in step with the decision just made. Nested
    // collections cannot be spread onto the context by key, so the group's own
    // writer builds the next context.
    const g = PUBLISHABLE.find(x => x.key === key);
    release(g?.write ? g.write(projectContext as any, items)
                     : ({ ...(projectContext as any), [key]: items }));
  };

  /**
   * Publish everything already on the record, up to now. This is what makes the
   * migration safe to run on a live project: the client gets back what they
   * could already see, and anything ops had deliberately hidden stays hidden.
   */
  const runBulkPublish = () => {
    let next: any = { ...(projectContext as any) };
    groups.forEach(g => {
      const updated = publishEverythingUpTo(g.items, new Date(), currentUser, g.dateOf);
      next = g.write ? g.write(next, updated) : { ...next, [g.key]: updated };
      writeGroup(g.key, updated);
    });
    setConfirmBulk(false);
    release(next);
  };

  /*
    Whether the client's copy is behind the project.

    This is what the send button is *for*, and without it the button had no
    visible occasion: publishing an item rewrites the projection on the spot, so
    ops reasonably asked what else there was to press. Plenty. The projection is
    a snapshot taken at release, and everything that is not an item publish —
    a decision logged, a payment milestone edited, the stage advancing, a room
    renamed — changes the project without touching the client's copy. It sits
    stale until somebody sends again.

    Compared by section counts, which catches things appearing and disappearing.
    It will not notice an edit in place; for that, the timestamp is the honest
    signal and it is shown alongside.
  */
  const behind = useMemo(() => {
    if (!sentSummary) return false;
    const now = new Map(preview.map(r => [r.section, r.count]));
    const sent = new Map(sentSummary.map(r => [r.section, r.count]));
    for (const key of new Set([...now.keys(), ...sent.keys()])) {
      if ((now.get(key) || 0) !== (sent.get(key) || 0)) return true;
    }
    return false;
  }, [preview, sentSummary]);

  /* The refusal, in the studio's own words rather than the console's.
     Firestore's message is shown verbatim: "Missing or insufficient
     permissions" names the problem far better than anything paraphrased. */
  const errorNote = sendError ? (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5">
      <p className="text-[11px] font-black uppercase tracking-wider text-rose-700">
        Could not send to their portal
      </p>
      <p className="text-[12px] font-medium text-rose-900/90 mt-1 leading-relaxed break-words">
        {sendError}
      </p>
    </div>
  ) : null;

  /* Shared by the empty state and the header, because "the client has no copy
     yet" is the more urgent fact in both. */
  const sendButton = (
    <button
      onClick={sendNow}
      disabled={!projectId || releasing}
      title={projectId ? undefined : 'Save the project first'}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        everSent === false || behind
          ? 'bg-[#3D52A0] text-white hover:bg-[#334486] border border-[#3D52A0]'
          : 'border border-slate-200 text-slate-700 hover:border-sky-300 hover:text-[#334486]'
      }`}
    >
      {releasing
        ? 'Sending…'
        : everSent === false
          ? 'Open their portal'
          : behind
            ? 'Send the latest'
            : 'Update their portal'}
    </button>
  );

  if (groups.length === 0) {
    return (
      <div className={`mb-4 rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-3 ${
        everSent === false ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
      }`}>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${everSent === false ? 'text-amber-950' : 'text-slate-900'}`}>
            {everSent === false ? 'Your client cannot open this project yet' : 'Nothing to publish yet'}
          </p>
          <p className={`text-xs mt-0.5 ${everSent === false ? 'text-amber-900/80' : 'text-slate-500'}`}>
            {everSent === false
              ? 'Nothing has been sent to their portal, so signing in tells them the project is not published. Send it and they can see the project itself — decisions, payments and documents follow as you publish them.'
              : 'Once this project has updates, drawings, selections or variations, you control here what the client sees.'}
          </p>
        </div>
        <div className="ml-auto">{sendButton}</div>
        {sendError && <div className="w-full">{errorNote}</div>}
      </div>
    );
  }

  return (
    /* Amber while anything is unpublished.

       This bar read the same whether every item was live or a re-issued
       document had been sitting in draft for a week — "1 draft" in grey, the
       same weight as "0 hidden". That is how a client ended up reading v1 of a
       Payment Schedule while the studio believed v2 had gone out. Unpublished
       work is a state the studio needs to notice, so the whole bar carries it. */
    <div className={`mb-4 rounded-2xl border overflow-hidden ${
      totals.draft > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
    }`}>
      <div className={`px-5 py-4 flex flex-wrap items-center gap-3 border-b ${
        totals.draft > 0 ? 'border-amber-200/70' : 'border-slate-100'
      }`}>
        <div className="min-w-0 flex items-start gap-2.5">
          {totals.draft > 0 && (
            <span className="relative flex w-2 h-2 shrink-0 mt-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-amber-500 opacity-60 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-500" />
            </span>
          )}
          <div className="min-w-0">
            <p className={`text-sm font-bold ${totals.draft > 0 ? 'text-amber-950' : 'text-slate-900'}`}>
              {totals.draft > 0
                ? `${totals.draft} item${totals.draft === 1 ? '' : 's'} the client cannot see yet`
                : 'What the client can see'}
            </p>
            <p className={`text-xs mt-0.5 ${totals.draft > 0 ? 'text-amber-900/80' : 'text-slate-500'}`}>
              {totals.draft > 0
                ? 'Prepared but unpublished. A re-issued document sits here too — the client keeps reading the previous version until this is cleared.'
                : 'Only published items appear in their portal. Drafts are invisible to them.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto text-xs font-semibold tabular-nums">
          <span className="text-emerald-700">{totals.published} published</span>
          <span className={totals.draft > 0
            ? 'text-amber-900 font-extrabold bg-amber-100 border border-amber-300 rounded-full px-2.5 py-0.5'
            : 'text-slate-500'}>
            {totals.draft} draft
          </span>
          {totals.hidden > 0 && <span className="text-amber-700">{totals.hidden} hidden</span>}
        </div>

        <div className="flex items-center gap-2">
          {!confirmBulk ? (
            <button
              onClick={() => setConfirmBulk(true)}
              disabled={totals.draft === 0}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                totals.draft > 0
                  ? 'bg-[#3D52A0] text-white hover:bg-[#334486] border border-[#3D52A0]'
                  : 'border border-slate-200 text-slate-700 hover:border-sky-300 hover:text-[#334486]'
              }`}
            >
              Publish everything up to today
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-600">
                Publish {totals.draft} draft item{totals.draft === 1 ? '' : 's'}?
              </span>
              <button
                onClick={runBulkPublish}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#3D52A0] text-white hover:bg-[#334486] cursor-pointer"
              >
                Publish
              </button>
              <button
                onClick={() => setConfirmBulk(false)}
                className="px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          {!confirmBulk && sendButton}
          <button
            onClick={() => setOpen(o => !o)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-700 hover:border-slate-300 transition-colors cursor-pointer"
          >
            {open ? 'Hide items' : 'Review item by item'}
          </button>
        </div>
      </div>

      {sendError && <div className="px-5 pb-3 -mt-1">{errorNote}</div>}

      {confirmBulk && (
        <div className="px-5 py-2.5 bg-sky-50/70 border-b border-sky-100 text-[11px] text-[#334486] font-medium">
          Anything you previously marked internal stays hidden — this only publishes drafts dated up to today.
        </div>
      )}

      {/* What actually reaches the client, and when it last did. Publishing
          decides what may be sent; this is the record of it being sent. */}
      <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sent to client</span>
        {preview.length === 0 ? (
          <span className="text-[11px] text-slate-400 font-medium">Nothing yet</span>
        ) : (
          preview.map(r => (
            <span key={r.section} className="text-[11px] text-slate-600 font-semibold tabular-nums">
              {r.count} {r.section.toLowerCase()}
            </span>
          ))
        )}
        <span className={`ml-auto text-[11px] font-medium ${
          everSent === false || behind ? 'text-amber-800 font-bold' : 'text-slate-400'
        }`}>
          {releasing
            ? 'Updating their copy…'
            : !projectId
              ? 'Preview only'
              : everSent === false
                ? 'Never sent — they cannot open this project'
                : behind
                  ? `Their copy is behind${releasedAt ? ` — last sent ${new Date(releasedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
                  : releasedAt
                    ? `Last sent ${new Date(releasedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                    : 'Checking their copy…'}
        </span>
      </div>

      {open && (
        <div className="max-h-[420px] overflow-y-auto">
          {groups.map(g => (
            <div key={g.key} className="border-b border-slate-100 last:border-b-0">
              <div className="px-5 py-2 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400">
                {g.label} ({g.items.length})
              </div>
              {g.items.map((item, i) => {
                const state = (item.clientVisibility?.state || migrateVisibility(item).state) as ClientVisibilityState;
                const visible = isVisibleToClient(item);
                return (
                  <div key={item.id || `${g.key}-${i}`} className="px-5 py-2.5 flex items-center gap-3 border-t border-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{g.titleOf(item)}</p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {g.dateOf(item) ? new Date(g.dateOf(item)).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'No date'}
                        {item.clientVisibility?.publishedAt &&
                          ` · published ${new Date(item.clientVisibility.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${STATE_STYLE[state]}`}>
                      {state}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setItemState(g.key, i, visible ? 'draft' : 'published')}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-[#334486] transition-colors cursor-pointer"
                      >
                        {visible ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => setItemState(g.key, i, 'hidden')}
                        title="Withhold from the client and record that it was deliberate"
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-700 transition-colors cursor-pointer"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
