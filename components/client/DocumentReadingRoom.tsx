/**
 * THE READING ROOM
 *
 * Replaces the old in-portal signing modal, which showed four hardcoded generic
 * bullets and then asked the client to affirm they were authorised to execute
 * the agreement. This renders the document the studio actually issued, tracks
 * how it was read, and only then unlocks the pen.
 *
 * The reading record it produces is the point. A squiggle is cheap; evidence
 * that the signatory opened the payment section and sat with it for eleven
 * seconds before ticking it is what makes the signature stand up.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FullProjectData,
  ClientDocumentKind,
  DocumentIssue,
  DigitalSignatureDocket,
  ReadingEvidence,
  MaterialSection,
  IssueDiffEntry
} from '../../types';
import DocumentRenderer from '../documents/DocumentRenderer';
import { resolveTokens } from '../documents/DocumentBlocks';
import DigitalSignaturePad from '../common/DigitalSignaturePad';
import { documentMode } from '../../services/documentReleaseEngine';
import {
  getCurrentIssue,
  getIssueHistory,
  diffIssues,
  changedSectionRefs,
  resolveDocumentState
} from '../../services/documentIssueEngine';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import {
  X,
  Check,
  Lock,
  FileText,
  Download,
  ShieldCheck,
  CheckCircle2,
  Circle,
  MessageCircleQuestion,
  AlertCircle,
  Clock,
  ChevronRight,
  Eye
} from 'lucide-react';

const DOC_TITLES: Record<ClientDocumentKind, string> = {
  terms_docket: 'Terms of Engagement Docket',
  payment_schedule: 'Payment Schedule',
  execution_agreement: 'Master Execution Agreement',
  onboarding_kit: 'Onboarding Kit',
  handover_docket: 'Handover & Acceptance Docket',
  variation_order: 'Variation Order'
};

interface DocumentReadingRoomProps {
  kind: ClientDocumentKind;
  projectData: FullProjectData;
  /** Omit to open read-only (studio preview, or an already-executed document). */
  onSignComplete?: (docket: DigitalSignatureDocket) => void;
  /** Open a specific issue rather than the current one — used for addenda. */
  issueId?: string;
  onRaiseQuery?: (clauseRef: string, excerpt: string, question: string) => void;
  onClose: () => void;
}

interface ReadingProgress {
  openedAt: number;
  dwellByRef: Record<string, number>;
  acknowledged: Record<string, number>;
  maxScrollPercent: number;
  downloaded: boolean;
}

const emptyProgress = (): ReadingProgress => ({
  openedAt: Date.now(),
  dwellByRef: {},
  acknowledged: {},
  maxScrollPercent: 0,
  downloaded: false
});

const DocumentReadingRoom: React.FC<DocumentReadingRoomProps> = ({
  kind,
  projectData,
  onSignComplete,
  onRaiseQuery,
  onClose,
  issueId
}) => {
  const { orgData } = useOrg();
  const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
  const studioName = settings?.companyName || orgData?.orgName || 'Design Studio';
  const context = projectData.context;

  const issue: DocumentIssue | null = useMemo(() => {
    if (issueId) {
      const found = (context.documents?.issues || []).find(i => i.id === issueId);
      if (found) return found;
    }
    return getCurrentIssue(context, kind);
  }, [context, kind, issueId]);

  const isAddendum = !!issue?.addendumTo;
  const docState = useMemo(() => resolveDocumentState(context, kind), [context, kind]);
  const isExecuted = isAddendum
    ? !!issue?.clientSignature
    : docState === 'signed' || docState === 'executed';
  const readOnly = !onSignComplete || isExecuted;

  // ── Amendment redline ───────────────────────────────────────────────────
  const { diff, changedRefs, previousVersion } = useMemo(() => {
    if (!issue?.supersedes) return { diff: [] as IssueDiffEntry[], changedRefs: [] as string[], previousVersion: null as number | null };
    const history = getIssueHistory(context, kind);
    const prev = history.find(i => i.id === issue.supersedes);
    if (!prev) return { diff: [], changedRefs: [], previousVersion: null };
    const d = diffIssues(prev, issue);
    return { diff: d, changedRefs: changedSectionRefs(d), previousVersion: prev.version };
  }, [issue, context, kind]);

  const showRedlineFirst = docState === 'amended' && diff.length > 0;
  const [view, setView] = useState<'redline' | 'document'>(showRedlineFirst ? 'redline' : 'document');

  // ── Persisted reading progress, keyed to the exact issue ─────────────────
  const storageKey = issue ? `ffds_reading_${projectData.id}_${issue.id}` : '';

  const [progress, setProgress] = useState<ReadingProgress>(() => {
    if (!storageKey || typeof localStorage === 'undefined') return emptyProgress();
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...emptyProgress(), ...JSON.parse(saved) } : emptyProgress();
    } catch {
      return emptyProgress();
    }
  });

  useEffect(() => {
    if (!storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      /* storage full or blocked — the in-memory record still stands */
    }
  }, [storageKey, progress]);


  // ── Dwell tracking ───────────────────────────────────────────────────────
  const activeRefRef = useRef<string | null>(null);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * Which section currently sits in the reading band — the middle third of the
   * scroll container. Measured from rects rather than an IntersectionObserver:
   * IO stops firing entirely when the page is not compositing (backgrounded
   * tab, hidden window) and is throttled on some mobile browsers. Reading
   * evidence is the whole point of this screen, so it cannot depend on that.
   */
  const measureSectionsInView = useCallback((): { primary: string | null; credited: string[] } => {
    // React is untyped in this project (no @types/react), so refs surface as
    // unknown — narrow explicitly rather than fighting inference.
    const container = scrollRef.current as HTMLElement | null;
    if (!container) return { primary: null, credited: [] };

    const box = container.getBoundingClientRect();
    const bandTop = box.top + box.height * 0.3;
    const bandBottom = box.top + box.height * 0.7;

    const nodes: HTMLElement[] = Array.from(
      container.querySelectorAll('[data-section-ref]')
    ) as HTMLElement[];

    let primary: { ref: string; overlap: number } | null = null;
    const credited: string[] = [];

    nodes.forEach(node => {
      const ref = node.getAttribute('data-section-ref') || '';
      if (!ref) return;
      const r = node.getBoundingClientRect();

      // A section sitting entirely inside the viewport is genuinely on screen,
      // even if it is too short to reach the reading band. Without this, short
      // sections — and everything at the end of a document, where there is no
      // room left to scroll — could never accrue reading time.
      const fullyVisible = r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      if (fullyVisible) credited.push(ref);

      const overlap = Math.min(r.bottom, bandBottom) - Math.max(r.top, bandTop);
      if (overlap > 0 && (!primary || overlap > primary.overlap)) {
        primary = { ref, overlap };
      }
    });

    const primaryRef = primary ? primary.ref : null;
    if (primaryRef && !credited.includes(primaryRef)) credited.push(primaryRef);

    return { primary: primaryRef ?? (credited[0] || null), credited };
  }, []);

  useEffect(() => {
    if (readOnly) return;
    // One tick per second against whichever section is in the reading band.
    // Paused while the tab is hidden, so a backgrounded window cannot inflate
    // the record with time nobody spent reading.
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const { primary, credited } = measureSectionsInView();
      if (credited.length === 0) return;
      if (primary) {
        activeRefRef.current = primary;
        setActiveRef(prev => (prev === primary ? prev : primary));
      }
      setProgress(p => {
        const dwellByRef = { ...p.dwellByRef };
        credited.forEach(ref => {
          dwellByRef[ref] = (dwellByRef[ref] || 0) + 1;
        });
        return { ...p, dwellByRef };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [readOnly, measureSectionsInView]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current as HTMLElement | null;
    if (!el) return;
    const denom = el.scrollHeight - el.clientHeight;
    const pct = denom > 0 ? Math.round((el.scrollTop / denom) * 100) : 100;
    setProgress(p => (pct > p.maxScrollPercent ? { ...p, maxScrollPercent: Math.min(100, pct) } : p));
    const { primary } = measureSectionsInView();
    if (primary) {
      activeRefRef.current = primary;
      setActiveRef(prev => (prev === primary ? prev : primary));
    }
  }, [measureSectionsInView]);

  // ── Acknowledgements ─────────────────────────────────────────────────────
  // What this document actually asks of the client decides the whole right rail.
  //   signature   — full ceremony: per-section ticks, then the pen
  //   acknowledge — read it, one confirmation, no signature
  //   review      — nothing to confirm at all
  const mode = documentMode(kind);

  const materialSections: MaterialSection[] = mode === 'signature'
    ? (issue?.materialSections || [])
    : [];
  const ackCount = materialSections.filter(s => progress.acknowledged[s.ref]).length;
  const allAcknowledged = materialSections.length > 0 && ackCount === materialSections.length;
  const canSign = readOnly ? false : materialSections.length === 0 ? true : allAcknowledged;

  // An acknowledge-mode document is confirmed once the client has actually had
  // it open, rather than by ticking clauses it does not bind them to.
  const totalDwell = Object.values(progress.dwellByRef).reduce<number>(
    (sum, sec) => sum + (Number(sec) || 0), 0
  );
  const canAcknowledge = !readOnly && (totalDwell >= 3 || progress.maxScrollPercent >= 25);

  const dwellFor = (s: MaterialSection) => progress.dwellByRef[s.ref] || 0;
  const dwellMet = (s: MaterialSection) => dwellFor(s) >= (s.minDwellSeconds ?? 4);

  const toggleAck = (s: MaterialSection) => {
    setProgress(p => {
      const next = { ...p.acknowledged };
      if (next[s.ref]) delete next[s.ref];
      else next[s.ref] = Date.now();
      return { ...p, acknowledged: next };
    });
  };

  const scrollToSection = (ref: string) => {
    setView('document');
    window.setTimeout(() => {
      const node = document.getElementById(`sec-${ref}`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  // ── Section index ────────────────────────────────────────────────────────
  // Read the sheet's own section anchors so the contents rail works for every
  // document, not only the ones with an authored clause list.
  const [domSections, setDomSections] = useState<{ ref: string; title: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      const container = scrollRef.current as HTMLElement | null;
      if (!container || cancelled) return;
      const found = Array.from(container.querySelectorAll('[data-section-ref]')).map(node => {
        const el = node as HTMLElement;
        const ref = el.dataset.sectionRef || '';
        const heading = el.matches('h1,h2,h3,h4')
          ? el
          : el.querySelector('h1,h2,h3,h4');
        // The heading carries the section number and, on some sheets, a badge
        // pill. Neither belongs in a contents entry — the number is already the
        // row's own marker, and the pill is a legend, not a title.
        let title = '';
        if (heading) {
          const clone = heading.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('.pill, span[class*="pill"]').forEach(n => n.remove());
          title = (clone.textContent || '')
            .replace(/^\s*[A-Z0-9+]{1,4}\s*[.·–—:)]?\s*/, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
        return { ref, title: title || `Section ${ref}` };
      }).filter(s2 => s2.ref);
      setDomSections(prev =>
        prev.length === found.length && prev.every((p2, i) => p2.ref === found[i].ref)
          ? prev
          : found
      );
    };
    // One frame for the sheet to paint, then a late pass for anything that
    // renders behind its own data fetch.
    const t1 = window.setTimeout(read, 60);
    const t2 = window.setTimeout(read, 600);
    return () => { cancelled = true; window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [issue?.id, view]);

  const sectionIndex = useMemo(() => {
    const settings = issue?.snapshot?.termsSettings;
    const sections = settings?.sections;
    if (Array.isArray(sections)) {
      return sections.map((s: any) => ({
        ref: String(s.n),
        // Titles carry the same {{token}} placeholders as clause bodies.
        title: resolveTokens(String(s.title || ''), settings, studioName)
      }));
    }
    if (materialSections.length > 0) {
      return materialSections.map(s => ({ ref: s.ref, title: s.title }));
    }
    // Acknowledge and review documents have no authored clause list, so the
    // contents come from the sheet itself — whatever the studio's own page
    // renders is what the client can navigate. Nothing is hardcoded here.
    return domSections;
  }, [issue, materialSections, studioName, domSections]);

  const readCount = sectionIndex.filter(s => (progress.dwellByRef[s.ref] || 0) > 0).length;

  // ── Clause query composer ────────────────────────────────────────────────
  const [queryDraft, setQueryDraft] = useState<{ ref: string; excerpt: string } | null>(null);
  const [queryText, setQueryText] = useState('');

  const handleClauseQuery = useCallback((ref: string, excerpt: string) => {
    setQueryDraft({ ref, excerpt });
    setQueryText('');
  }, []);

  const submitQuery = () => {
    if (!queryDraft || !queryText.trim() || !onRaiseQuery) return;
    onRaiseQuery(queryDraft.ref, queryDraft.excerpt, queryText.trim());
    setQueryDraft(null);
    setQueryText('');
  };

  // ── Signing ──────────────────────────────────────────────────────────────
  const [signing, setSigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSigned = (docket: DigitalSignatureDocket) => {
    if (!issue || !onSignComplete) return;
    setSubmitting(true);

    const evidence: ReadingEvidence = {
      issueId: issue.id,
      contentHash: issue.contentHash,
      openedAt: progress.openedAt,
      signedAt: Date.now(),
      totalDwellSeconds: Object.values(progress.dwellByRef).reduce<number>(
        (sum, seconds) => sum + (Number(seconds) || 0),
        0
      ),
      maxScrollPercent: progress.maxScrollPercent,
      sectionsAcknowledged: materialSections
        .filter(s => progress.acknowledged[s.ref])
        .map(s => ({
          ref: s.ref,
          acknowledgedAt: progress.acknowledged[s.ref],
          dwellSeconds: dwellFor(s)
        })),
      documentDownloaded: progress.downloaded,
      device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      viewport:
        typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown'
    };

    onSignComplete({
      ...docket,
      issueId: issue.id,
      contentHash: issue.contentHash,
      readingEvidence: evidence
    });

    try {
      if (storageKey) localStorage.removeItem(storageKey);
    } catch {
      /* nothing depends on this succeeding */
    }
    setSubmitting(false);
  };

  const handleDownload = () => {
    setProgress(p => ({ ...p, downloaded: true }));
    window.print();
  };

  const title = DOC_TITLES[kind] || 'Document';

  // ── Not released ─────────────────────────────────────────────────────────
  if (!issue) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{title} is not ready yet</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your studio has not released this document. You will be notified here the moment
            it is ready for you to read and sign.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0066CC]/10 text-[#0066CC] flex items-center justify-center shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 leading-tight truncate">{title}</h2>
            <p className="text-[11px] text-slate-400 font-medium">
              {issue.reference} · Version {issue.version}
              {isExecuted && <span className="text-emerald-600 font-bold"> · Signed</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownload}
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-slate-100">
        {/* Left: section index */}
        <aside className="hidden lg:flex lg:w-64 shrink-0 bg-white border-r border-slate-200 flex-col">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contents</p>
            {!readOnly && sectionIndex.length > 0 && (
              <>
                <p className="text-xs font-bold text-slate-800 mt-1.5">
                  {readCount} of {sectionIndex.length} sections read
                </p>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-[#0066CC] rounded-full transition-all duration-500"
                    style={{ width: `${sectionIndex.length ? (readCount / sectionIndex.length) * 100 : 0}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            {diff.length > 0 && (
              <button
                onClick={() => setView('redline')}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-2 transition-colors cursor-pointer ${
                  view === 'redline' ? 'bg-amber-50 border border-amber-300' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  What changed ({diff.length})
                </span>
              </button>
            )}

            {sectionIndex.map(s => {
              const read = (progress.dwellByRef[s.ref] || 0) > 0;
              const material = materialSections.find(m => m.ref === s.ref);
              const acked = !!progress.acknowledged[s.ref];
              const changed = changedRefs.includes(s.ref);
              return (
                <button
                  key={s.ref}
                  onClick={() => scrollToSection(s.ref)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer ${
                    activeRef === s.ref && view === 'document' ? 'bg-[#0066CC]/8' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {acked ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : read ? (
                      <span className="block w-3.5 h-3.5 rounded-full bg-slate-300" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[11px] leading-snug ${
                        read ? 'text-slate-800 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      <span className="font-mono text-slate-400 mr-1.5">{s.ref}</span>
                      {s.title}
                    </span>
                    {material && !acked && (
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-amber-700 mt-0.5">
                        Needs your tick
                      </span>
                    )}
                  </span>
                  {changed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" title="Changed" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Centre: the document */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-8 py-6"
        >
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
            {view === 'redline' && diff.length > 0 ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {diff.length} thing{diff.length === 1 ? '' : 's'} changed since you last read this
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Version {previousVersion} → {issue.version}. Everything else is unchanged.
                  </p>
                </div>

                <ul className="space-y-2.5">
                  {diff.map((d, i) => (
                    <li key={i} className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50">
                      <p className="text-xs font-bold text-slate-900">{d.label}</p>
                      <p className="text-[11px] mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="line-through text-slate-400">{d.before}</span>
                        <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-bold text-slate-900">{d.after}</span>
                      </p>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => setView('document')}
                  className="px-4 py-2.5 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Read the full document
                </button>
              </div>
            ) : (
              <DocumentRenderer
                issue={issue}
                surface="portal"
                studioName={studioName}
                onClauseQuery={readOnly || !onRaiseQuery ? undefined : handleClauseQuery}
                highlightRefs={changedRefs}
              />
            )}
          </div>
        </div>

        {/* Right rail — what it offers depends on what the document asks. */}
        {!readOnly && mode !== 'review' && (
          <aside className="lg:w-96 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col max-h-[52vh] lg:max-h-none">
            {mode === 'acknowledge' ? (
              /* ── Acknowledge: one confirmation, no signature ceremony ── */
              <>
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0066CC]" />
                    Confirm you have this
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    This document does not need a signature — the terms behind it are already
                    covered by your Terms of Engagement. Just confirm you have received and read it.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-800">{title}</p>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Version {issue.version} · issued{' '}
                      {new Date(issue.issuedAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      If anything here looks wrong, ask your studio about it before confirming —
                      use “Ask about this” next to any line.
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 p-4">
                  <button
                    onClick={() => handleSigned({
                      signatoryName: context.clientName || 'Client',
                      signatoryEmail: context.clientEmail,
                      signedAt: new Date().toISOString(),
                      signatureType: 'type',
                      ipAddress: 'Client portal — acknowledgement',
                      docketHash: `ACK:${issue.contentHash}`,
                      verified: true,
                      legalAffirmation: false
                    } as DigitalSignatureDocket)}
                    disabled={!canAcknowledge}
                    className={`w-full py-3 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 ${
                      canAcknowledge
                        ? 'bg-[#0066CC] hover:bg-[#0055B3] text-white cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    {canAcknowledge ? 'I have received and read this' : 'Have a read first'}
                  </button>
                  {!canAcknowledge && (
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      The button enables once you have looked through the document.
                    </p>
                  )}
                </div>
              </>
            ) : (
              /* ── Signature: the full reading ceremony ── */
              <>
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    Confirm you have read the key terms
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {materialSections.length === 0
                      ? 'Read the document, then sign below.'
                      : `${ackCount} of ${materialSections.length} confirmed. Each box unlocks once you have spent a moment on that section.`}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {materialSections.map(s2 => {
                    const acked = !!progress.acknowledged[s2.ref];
                    const ready = dwellMet(s2);
                    const remaining = Math.max(0, (s2.minDwellSeconds ?? 4) - dwellFor(s2));
                    return (
                      <div
                        key={s2.ref}
                        className={`rounded-xl border p-3.5 transition-colors ${
                          acked ? 'border-emerald-200 bg-emerald-50/50' : ready ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'
                        }`}
                      >
                        <label className={`flex items-start gap-3 ${ready ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                          <input
                            type="checkbox"
                            checked={acked}
                            disabled={!ready}
                            onChange={() => toggleAck(s2)}
                            className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0 disabled:opacity-40"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-slate-900">
                              <span className="font-mono text-slate-400 mr-1.5">{s2.ref}</span>
                              {s2.title}
                            </span>
                            <span className="block text-[11px] text-slate-600 mt-1 leading-relaxed">
                              {s2.plainSummary}
                            </span>
                          </span>
                        </label>

                        <div className="flex items-center justify-between gap-2 mt-2 pl-7">
                          <button
                            onClick={() => scrollToSection(s2.ref)}
                            className="text-[10px] font-bold text-[#0066CC] hover:underline cursor-pointer"
                          >
                            Read this section →
                          </button>
                          {!ready && (
                            <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                              Opens in {remaining}s
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 p-4">
                  {canSign ? (
                    signing ? (
                      <div className="max-h-[40vh] overflow-y-auto">
                        <DigitalSignaturePad
                          initialName={context.clientName || ''}
                          initialEmail={context.clientEmail || ''}
                          documentTitle={title}
                          projectTitle={context.name}
                          onSignComplete={handleSigned}
                          onCancel={() => setSigning(false)}
                          isSubmitting={submitting}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setSigning(true)}
                        className="w-full py-3 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Sign this document
                      </button>
                    )
                  ) : (
                    <div className="w-full py-3 px-4 bg-slate-100 border border-slate-200 rounded-xl text-center">
                      <p className="text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                        <Lock className="w-3.5 h-3.5" />
                        Signing locked
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Confirm all {materialSections.length} key terms to enable signing.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* ── Clause query composer ──────────────────────────────────────── */}
      {queryDraft && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageCircleQuestion className="w-4 h-4 text-[#0066CC]" />
                Ask about clause {queryDraft.ref}
              </h3>
              <button
                onClick={() => setQueryDraft(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <blockquote className="text-[11px] text-slate-600 leading-relaxed border-l-2 border-slate-300 pl-3 italic max-h-32 overflow-y-auto">
                {queryDraft.excerpt}
              </blockquote>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  What would you like to know?
                </label>
                <textarea
                  value={queryText}
                  onChange={e => setQueryText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="e.g. Does the grace period start from the invoice date or the due date?"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#0066CC] resize-none"
                />
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">
                Your studio sees this clause exactly as written above, alongside your question.
                Signing stays paused until they reply.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setQueryDraft(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={submitQuery}
                  disabled={!queryText.trim()}
                  className="px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Send to studio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentReadingRoom;
