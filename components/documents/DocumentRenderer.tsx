/**
 * DOCUMENT RENDERER — the client portal's view of a released document.
 *
 * THE RULE: the app is the source of truth for every client document. Nothing
 * here rebuilds a document. Each case hands the frozen snapshot to the very same
 * Sheet component the studio page renders, so what the client reads and signs is
 * the document the studio produced — same branding, same clause numbering, same
 * tables, same figures.
 *
 * This file exists only to pick the right sheet and unpack the snapshot into it.
 * If you find yourself writing document markup in here, something has gone wrong.
 */

import React from 'react';
import { DocumentIssue } from '../../types';
import { DocumentSurface } from './DocumentBlocks';
import TermsDocketSheet from './TermsDocketSheet';
import PaymentScheduleSheet from './PaymentScheduleSheet';
import ExecutionAgreementSheet from './ExecutionAgreementSheet';
import HandoverDocketSheet from './HandoverDocketSheet';
import OnboardingKitSheet from './OnboardingKitSheet';
import SnagListSheet from './SnagListSheet';
import ExecutionStamp from './ExecutionStamp';
import { MessageCircleQuestion, MessagesSquare, Check } from 'lucide-react';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { documentMode, SignatureMode } from '../../services/documentReleaseEngine';

export interface DocumentRendererProps {
  /** The frozen issue. Never a live context object. */
  issue: DocumentIssue;
  surface: DocumentSurface;
  onClauseQuery?: (ref: string, excerpt: string) => void;
  /** Section refs changed since the reader last saw the document. */
  highlightRefs?: string[];
  studioName?: string;
  /** Questions already raised against this issue, marked on their clause. */
  clauseQueries?: ClauseQueryMark[];
}

/** One question the client has already asked, as this component needs it. */
export interface ClauseQueryMark {
  id: string;
  ref: string;
  question: string;
  status: 'open' | 'answered' | 'amended' | 'withdrawn';
  askedAt: number;
  replies: { at: number; by: string; side: 'studio' | 'client'; text: string }[];
}

/** Shown when a snapshot predates its sheet, or the document isn't out yet. */
const Unavailable: React.FC<{ what: string }> = ({ what }) => (
  <article className="doc-body">
    <p className="text-[13px] text-slate-500 leading-relaxed">
      This {what} is being prepared by your studio and will appear here once issued.
    </p>
  </article>
);

/**
 * A minimal ProjectContext shim built from the snapshot. The sheets read client
 * and project identity plus a few fallbacks; all of it was frozen at release, so
 * nothing reaches back into live project data.
 */
const shimContext = (snap: any) =>
  ({
    clientName: snap.clientName,
    name: snap.projectName,
    location: snap.location,
    clientEmail: snap.clientEmail,
    clientPhone: snap.clientPhone,
    area: snap.area,
    financials: snap.financials || {},
    engagement: { docketRef: snap.engagementDocketRef || snap.docketRef },
    termsDockets: [],
    paymentMilestones: snap.milestonesList || [],
    gstRate: snap.gstRate ?? 18
  }) as any;

/**
 * Puts an "Ask" control on whichever clause the reader is hovering.
 *
 * `onClauseQuery` was declared on this component's props and never read — the
 * reading room passed a handler in, this dropped it, and the reading room's own
 * help text told the client to "use 'Ask about this' next to any line" about a
 * control that had never been built. The only way to ask about a document was
 * the general box, which is not much use against a fourteen-section docket.
 *
 * It is done here, once, rather than per sheet: this component is a switch over
 * six independent sheet components, and threading a callback down to every
 * numbered paragraph in all six means editing all six and re-editing each time
 * one changes. Hovering the rendered paragraph needs no cooperation from them.
 *
 * The clause's own text becomes the excerpt, which is what `raiseQuery` wants —
 * it stores `clauseExcerpt` verbatim, "never paraphrased, the studio must see
 * what the client saw".
 */
/**
 * A section is the unit people ask about — "what does clause 5 mean" is really
 * "what does Change Requests mean". Sheets mark them with `.sec-group` and
 * `data-section-ref`; where a sheet has no section wrapper we fall back to the
 * paragraph, so every sheet gets the control whether or not it marks sections.
 */
const SECTION_SELECTOR = '[data-section-ref], .sec-group, section';
const CLAUSE_TAGS = new Set(['P', 'LI', 'TD', 'DD']);
/** Long enough to be a provision rather than a label or a table cell of dates. */
const MIN_CLAUSE_CHARS = 40;

const ClauseQuestions: React.FC<{
  onAsk?: (ref: string, excerpt: string) => void;
  queries?: ClauseQueryMark[];
  children: React.ReactNode;
}> = ({ onAsk, queries, children }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [hot, setHot] = React.useState<{ top: number; height: number; text: string; ref: string } | null>(null);
  /** Where each asked-about clause sits, so the mark rides with the text. */
  const [marks, setMarks] = React.useState<{ ref: string; top: number; height: number }[]>([]);
  const [openMark, setOpenMark] = React.useState<string | null>(null);

  /** The clause number for a block: its own prefix, else the nearest above. */
  const refFor = (el: HTMLElement): string => {
    const own = (el.textContent || '').trim().match(/^(\d+(?:\.\d+)*|[A-Z])[.)\s]/);
    if (own) return own[1];
    let node: HTMLElement | null = el;
    while (node && node !== hostRef.current) {
      let sib = node.previousElementSibling as HTMLElement | null;
      while (sib) {
        const t = (sib.textContent || '').trim();
        // Only a short leading block is a heading; a long one is another clause.
        const m = t.match(/^(\d+(?:\.\d+)*|[A-Z])[.)\s]/);
        if (m && t.length < 160) return m[1];
        sib = sib.previousElementSibling as HTMLElement | null;
      }
      node = node.parentElement;
    }
    return 'General';
  };

  const onMove = (e: React.MouseEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const target = e.target as HTMLElement | null;
    if (!target) { setHot(null); return; }

    /*
      The pill was unreachable. It lives inside the host, so moving the pointer
      towards it fired this handler with the pill itself as the target; the pill
      is not a clause, so `hot` was cleared and the button unmounted from under
      the cursor. It could be seen and never clicked.

      Moving over the pill keeps the current selection, and the margin between
      the text and the pill is treated as part of the hovered band — that gives
      a corridor to travel along instead of a gap that dismisses the control.
    */
    if (target.closest('.portal-ask-pill')) return;
    // No handler means no asking — the studio's own pages render these sheets.
    if (!onAsk) { if (hot) setHot(null); return; }
    // The mark and its thread are the subject while open; do not re-aim.
    if (target.closest('.portal-query-mark')) return;

    // Prefer the whole section; fall back to the paragraph on sheets that do
    // not wrap their sections.
    const section = target.closest(SECTION_SELECTOR) as HTMLElement | null;
    let el: HTMLElement | null = section && host.contains(section) ? section : null;
    if (!el) {
      let p: HTMLElement | null = target;
      while (p && p !== host && !CLAUSE_TAGS.has(p.tagName)) p = p.parentElement;
      el = p && p !== host ? p : null;
    }
    const hostBox = host.getBoundingClientRect();
    const k0 = host.offsetWidth ? hostBox.width / host.offsetWidth : 1;
    const localY = (e.clientY - hostBox.top) / (k0 || 1);
    /** Still inside the band we already highlighted — hold it. */
    const inBand = (h: typeof hot) => !!h && localY >= h.top - 8 && localY <= h.top + h.height + 8;

    if (!el) { if (!inBand(hot)) setHot(null); return; }

    const text = (el.textContent || '').trim();
    if (text.length < MIN_CLAUSE_CHARS) { if (!inBand(hot)) setHot(null); return; }

    const r = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    // The reading room scales the whole page to fit its pane, so rects come
    // back in visual pixels while `style.top` is applied in local ones. Without
    // dividing through, the pill drifts further from its section the further
    // down the document you read.
    const scale = host.offsetWidth ? h.width / host.offsetWidth : 1;
    const k = scale || 1;
    const ref = el.getAttribute('data-section-ref') || refFor(el);
    setHot({ top: (r.top - h.top) / k, height: r.height / k, text, ref });
  };

  /*
    A question, once asked, belongs on the clause it was asked about.

    Until now it vanished into the studio's inbox: the client sent it, the
    reading room closed, and re-opening the document showed no trace that they
    had ever queried anything — so the only way to know was to remember. The
    marks below are laid out from the live DOM against the same refs the Ask
    control uses, which is what keeps a mark on its own clause when the page
    reflows or the pane is resized.
  */
  const byRef = React.useMemo(() => {
    const m = new Map<string, ClauseQueryMark[]>();
    (queries || [])
      .filter(q => q.status !== 'withdrawn')
      .forEach(q => {
        const list = m.get(q.ref);
        if (list) list.push(q);
        else m.set(q.ref, [q]);
      });
    return m;
  }, [queries]);

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || byRef.size === 0) { setMarks(prev => (prev.length ? [] : prev)); return; }

    /*
      Two things here are load-bearing, and the screen froze without them.

      The effect must NOT depend on `children` — that is a fresh element every
      render, so the effect re-ran on each one, measured, set state, and
      re-rendered itself forever. And the measurement must return the PREVIOUS
      array when nothing moved, or every ResizeObserver callback allocates a new
      array, re-renders, and drives the same loop. The renderer locked up and
      framer-motion was left mid-animation on null keyframes.
    */
    let frame = 0;
    const index = () => {
      const h = host.getBoundingClientRect();
      const k = (host.offsetWidth ? h.width / host.offsetWidth : 1) || 1;
      const found = new Map<string, { ref: string; top: number; height: number }>();
      host.querySelectorAll<HTMLElement>(SECTION_SELECTOR).forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.length < MIN_CLAUSE_CHARS) return;
        const ref = el.getAttribute('data-section-ref') || refFor(el);
        if (!byRef.has(ref) || found.has(ref)) return;
        const r = el.getBoundingClientRect();
        found.set(ref, { ref, top: (r.top - h.top) / k, height: r.height / k });
      });
      const next = [...found.values()];
      setMarks(prev =>
        prev.length === next.length &&
        prev.every((p, i) =>
          p.ref === next[i].ref &&
          Math.abs(p.top - next[i].top) < 0.5 &&
          Math.abs(p.height - next[i].height) < 0.5)
          ? prev
          : next,
      );
    };

    index();
    // The reading room scales the page to fit and sheets settle after fonts
    // load, so a single pass on mount lands the marks in the wrong places.
    // Deferred to the next frame so a measurement never runs inside the
    // observer callback that provoked it.
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(index);
    });
    ro.observe(host);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [byRef]);

  return (
    <div
      ref={hostRef}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={() => setHot(null)}
    >
      {children}

      {/* The hovered section, tinted and rule-marked. Without this the pill
          floats beside the page with nothing saying which part it belongs to. */}
      {hot && (
        <div
          aria-hidden="true"
          style={{ top: hot.top - 6, height: hot.height + 12 }}
          className="absolute left-0 right-0 z-10 pointer-events-none rounded-xl bg-sky-50/60 border-l-[3px] border-[#0066CC]/45 transition-all duration-150"
        />
      )}

      {/* Clauses this client has already asked about. A rule on the clause so
          it is findable while reading, and a tab that opens the thread. */}
      {marks.map(m => {
        const qs = byRef.get(m.ref) || [];
        if (!qs.length) return null;
        const answered = qs.some(q => q.replies.some(r => r.side === 'studio'));
        const isOpen = openMark === m.ref;
        return (
          <React.Fragment key={`mark-${m.ref}`}>
            <span
              aria-hidden="true"
              style={{ top: m.top - 4, height: m.height + 8 }}
              className={`absolute left-0 right-0 z-0 pointer-events-none rounded-xl border-l-[3px] ${
                answered ? 'border-emerald-400/70 bg-emerald-50/25' : 'border-amber-400/70 bg-amber-50/25'
              }`}
            />
            <button
              onClick={() => setOpenMark(isOpen ? null : m.ref)}
              aria-expanded={isOpen}
              style={{ top: m.top + 2 }}
              className={`portal-query-mark group absolute left-3 z-30 h-8 pl-2.5 pr-3 rounded-full
                          bg-white/85 backdrop-blur-md border shadow-lg shadow-sky-900/10
                          cursor-pointer flex items-center gap-1.5 transition-all duration-150
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]/40 ${
                answered
                  ? 'border-emerald-200 text-emerald-800 hover:bg-white'
                  : 'border-amber-200 text-amber-800 hover:bg-white'
              }`}
            >
              <MessagesSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[10px] font-bold whitespace-nowrap">
                {answered ? 'Answered' : 'You asked'}
                {qs.length > 1 && ` · ${qs.length}`}
              </span>
            </button>

            {isOpen && (
              <div
                style={{ top: m.top + 36 }}
                className="portal-query-mark absolute left-3 z-40 w-[300px] max-h-[320px] overflow-y-auto
                           rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-900/10 p-3.5 space-y-3"
              >
                {qs.map(q => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      You asked · clause {q.ref}
                    </p>
                    <p className="text-[11px] text-slate-800 font-semibold leading-relaxed">{q.question}</p>
                    {q.replies.length === 0 ? (
                      <p className="text-[10px] text-amber-700 font-semibold">
                        Waiting on your studio.
                      </p>
                    ) : (
                      q.replies.map((r, i) => (
                        <div
                          key={i}
                          className={`rounded-xl p-2.5 ${
                            r.side === 'studio' ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'
                          }`}
                        >
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                            {r.side === 'studio' && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                            {r.side === 'studio' ? 'Your studio replied' : 'You added'}
                          </p>
                          <p className="text-[11px] text-slate-700 leading-relaxed">{r.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {hot && (
        <button
          key={hot.ref}
          onClick={() => { onAsk!(hot.ref, hot.text); setHot(null); }}
          style={{ top: hot.top + 2 }}
          /* In the right margin, so it never covers the words being read. The
             label slides out of the circle on hover — at rest it is a mark, not
             a button competing with the contract for attention. */
          /* Milky-white glass with a sky rim. The label is always present —
             a circle that only names itself once you are already on it cannot
             be found by someone who does not know it is there. */
          className="portal-ask-pill group absolute right-3 z-30 h-9 pl-3 pr-3.5 rounded-full
                     bg-white/85 backdrop-blur-md border border-sky-200
                     text-[#0055B3] shadow-lg shadow-sky-900/10 cursor-pointer
                     flex items-center gap-1.5
                     hover:bg-white hover:border-sky-300 hover:shadow-sky-900/15
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]/40
                     transition-all duration-150 ease-out"
        >
          <MessageCircleQuestion className="w-4 h-4 shrink-0" />
          <span className="text-[11px] font-bold whitespace-nowrap">
            Ask about {hot.ref === 'General' ? 'this' : hot.ref}
          </span>
        </button>
      )}
    </div>
  );
};


const DocumentRenderer: React.FC<DocumentRendererProps> = ({
  issue,
  onClauseQuery,
  clauseQueries,
  studioName = 'Design Studio'
}) => {
  const snap = issue.snapshot || {};
  const org = snap.org || {};
  const orgName = org.orgName || studioName;

  const sheet = (() => {
  switch (issue.kind) {
    // ── Terms of Engagement ────────────────────────────────────────────────
    case 'terms_docket': {
      if (!snap.termsSettings) return <Unavailable what="docket" />;
      return (
        <TermsDocketSheet
          activeTermsConfig={snap.termsSettings}
          latestDocket={snap.latestDocket || { docketRef: issue.reference, status: 'issued' }}
          snapshotClientData={snap.snapshotClientData}
          orgData={{ ...org, orgName }}
        />
      );
    }

    // ── Payment Schedule ───────────────────────────────────────────────────
    case 'payment_schedule': {
      if (!snap.schedule) return <Unavailable what="payment schedule" />;
      return (
        <PaymentScheduleSheet
          schedule={snap.schedule}
          projectContext={shimContext(snap)}
          org={{ ...org, orgName }}
          showAmounts
        />
      );
    }

    // ── Master Execution Agreement ─────────────────────────────────────────
    case 'execution_agreement': {
      if (!snap.milestonesList && !snap.boq) return <Unavailable what="agreement" />;
      return (
        <ExecutionAgreementSheet
          projectContext={shimContext(snap)}
          orgData={{ ...org, orgName }}
          studioName={orgName}
          studioAddress={org.officeAddress}
          studioEmail={org.contactEmail}
          repName={org.signatoryName}
          clientName={snap.clientName}
          clientAddress={snap.clientAddress}
          clientEmail={snap.clientEmail}
          clientPhone={snap.clientPhone}
          projectName={snap.projectName}
          agreementDate={snap.agreementDate}
          dateStr={snap.dateStr}
          commencementTrigger={snap.commencementTrigger}
          estimatedDuration={snap.estimatedDuration}
          designFee={snap.designFee || 0}
          executionTotal={snap.executionTotal || 0}
          grandTotal={snap.grandTotal || 0}
          gstAmount={snap.gstAmount}
          gstRate={snap.gstRate ?? 18}
          milestonesList={snap.milestonesList || []}
          allAdvances={snap.allAdvances}
          boq={snap.boq}
          boqItemSpecOverrides={snap.boqItemSpecOverrides}
          groupedBoq={snap.groupedBoq}
          overrides={snap.overrides}
          calculateSellPrice={calculateSellPrice as any}
          formatCurrency={formatCurrency as any}
          /* No edit affordances for the client — read-only by omission. */
        />
      );
    }

    // ── Handover & Acceptance Docket ───────────────────────────────────────
    case 'handover_docket': {
      return (
        <HandoverDocketSheet
          projectContext={shimContext(snap)}
          studioName={orgName}
          clientName={snap.clientName}
          projectName={snap.projectName}
          displayDate={snap.displayDate || ''}
          defaultWarrantyPeriod={snap.defaultWarrantyPeriod}
          org={{
            orgLogo: org.orgLogo,
            contactEmail: org.contactEmail,
            contactPhone: org.contactPhone,
            officeAddress: org.officeAddress
          }}
        />
      );
    }

    // ── Onboarding Kit ─────────────────────────────────────────────────────
    case 'snag_list': {
      return (
        <SnagListSheet
          studioName={studioName}
          clientName={snap.clientName || 'Client'}
          projectName={snap.projectName || 'Project'}
          location={snap.location}
          displayDate={snap.displayDate || ''}
          snags={snap.snags || []}
          totalCount={snap.totalCount ?? (snap.snags || []).length}
          closedCount={snap.closedCount ?? 0}
          openCount={snap.openCount ?? 0}
          org={org}
        />
      );
    }

    case 'onboarding_kit': {
      return (
        <OnboardingKitSheet
          projectContext={shimContext(snap)}
          orgData={{ ...org, orgName }}
          studioName={orgName}
          clientName={snap.clientName}
          projectName={snap.projectName}
          location={snap.location}
          area={snap.area}
          designFee={snap.designFee}
          d1Amount={snap.d1Amount}
          docketRef={snap.docketRef}
          officeAddress={org.officeAddress}
        />
      );
    }

    default:
      return <Unavailable what="document" />;
  }
  })();

  /*
    Asking is offered only where a handler was given — the studio's own document
    pages render the same sheets and must stay inert. The wrapper is still
    mounted for a read-only reader who has questions on the record, so a client
    re-reading a signed document can see what they asked and what came back.
  */
  /* The paper, then how it was executed. */
  const withStamp = (
    <>
      {sheet}
      <ExecutionStamp issue={issue} mode={documentMode(issue.kind)} />
    </>
  );

  return onClauseQuery || (clauseQueries && clauseQueries.length > 0)
    ? <ClauseQuestions onAsk={onClauseQuery} queries={clauseQueries}>{withStamp}</ClauseQuestions>
    : withStamp;
};

export default DocumentRenderer;
